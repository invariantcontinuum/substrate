import asyncio
import hashlib
import os
import shutil
import time
import structlog
from src.config import settings
from src.connectors.github import (
    parse_imports, PARSEABLE_EXTENSIONS,
)
from src.connectors.base import MaterializedTree
from src.connectors.github import CONNECTORS
from src import graph_writer, sync_runs, sync_issues
from src.chunker import chunk_file, file_summary_text
from src.llm import embed_batch, EmbeddingDimError

logger = structlog.get_logger()

EMBED_BATCH_SIZE = 32
CANCELLATION_POLL_EVERY_N = 50


class CancelledSync(Exception):
    pass


_LANG_MAP: dict[str, str] = {
    ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".java": "java", ".kt": "kotlin", ".swift": "swift", ".cs": "csharp",
    ".rb": "ruby", ".php": "php", ".lua": "lua", ".zig": "zig",
    ".pl": "perl", ".pm": "perl", ".sh": "shell", ".bash": "shell",
    ".md": "markdown", ".rst": "restructuredtext",
    ".yaml": "yaml", ".yml": "yaml", ".json": "json", ".toml": "toml",
    ".xml": "xml", ".html": "html", ".htm": "html", ".css": "css",
    ".sql": "sql", ".cmake": "cmake",
}


def _detect_language(file_path: str) -> str:
    name = file_path.rsplit("/", 1)[-1]
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
        return _LANG_MAP.get(ext, "")
    name_lower = name.lower()
    if name_lower in ("makefile", "gnumakefile"):
        return "make"
    if name_lower == "dockerfile":
        return "dockerfile"
    return ""


async def _check_cancelled(sync_id: str) -> None:
    status = await sync_runs.check_sync_status(sync_id)
    if status == "cancelled":
        raise CancelledSync()


def _read_text_safe(filepath: str) -> str:
    """Read a file as text, dropping NUL bytes that Postgres TEXT/JSON can't store.

    Some files in real repos (binary blobs misnamed with text extensions, embedded
    icons in docs trees, etc.) contain `\\x00`. Python tolerates them in str, but
    Postgres rejects them with `invalid byte sequence for encoding "UTF8": 0x00`.
    Strip them at the boundary so downstream code (chunker, content_chunks INSERT)
    never sees them.
    """
    try:
        with open(filepath, "r", errors="replace") as f:
            return f.read().replace("\x00", "")
    except Exception:
        return ""


async def handle_sync(sync_id: str, source: dict, config_snapshot: dict) -> None:
    """Run one sync to completion. The runner already created the sync_runs row."""
    source_id = source["id"]
    source_type = source["source_type"]
    label = f"{source['owner']}/{source['name']}"
    sync_start = time.monotonic()
    logger.info("sync_started", sync_id=sync_id, source=label)

    if not await sync_runs.claim_sync_run(sync_id):
        logger.info("sync_already_claimed_or_cancelled", sync_id=sync_id)
        return

    connector = CONNECTORS.get(source_type)
    if not connector:
        await sync_issues.record_issue(
            sync_id, "error", "startup", "no_connector",
            f"No connector registered for source_type={source_type}", {})
        await sync_runs.fail_sync_run(sync_id, "no connector")
        return

    meta = {
        "phase": "cloning", "source": label,
        "files_total": 0, "files_parseable": 0,
        "files_parsed": 0, "files_embedded": 0,
        "chunks_total": 0, "chunks_embedded": 0,
        "edges_found": 0, "nodes_by_type": {},
    }
    await sync_runs.update_sync_progress(sync_id, 0, 0, meta)

    tree: MaterializedTree | None = None
    try:
        tree = await connector.materialize(source, scratch_dir="/tmp")
        if tree.ref:
            await sync_runs.set_ref(sync_id, tree.ref)
        await _check_cancelled(sync_id)

        meta["phase"] = "discovering"
        await sync_runs.update_sync_progress(sync_id, 0, 0, meta)

        from src.connectors.github import (
            parse_repo_tree, _walk_local_tree, _read_go_module,
        )
        local_tree = _walk_local_tree(tree.root_dir)
        nodes = parse_repo_tree(local_tree)
        known_files = {n.id for n in nodes}
        # Read the Go module path (if any) from go.mod at the repo root
        # so Go package imports like `github.com/org/repo/pkg/foo` can
        # resolve to sibling .go files under pkg/foo/ during edge
        # extraction. Without this, every Go import fails to match and
        # the graph lands edge-less.
        go_module = _read_go_module(tree.root_dir)
        type_counts: dict[str, int] = {}
        for n in nodes:
            type_counts[n.type] = type_counts.get(n.type, 0) + 1
        parseable = [
            n.id for n in nodes
            if "." in n.id and "." + n.id.rsplit(".", 1)[-1] in PARSEABLE_EXTENSIONS
        ]
        meta.update({"files_total": len(nodes), "files_parseable": len(parseable),
                     "nodes_by_type": type_counts})
        await sync_runs.update_sync_progress(sync_id, 0, len(nodes), meta)

        meta["phase"] = "parsing"
        all_edges = []
        file_contents: dict[str, str] = {}
        for i, file_id in enumerate(parseable):
            filepath = os.path.join(tree.root_dir, file_id)
            try:
                content = _read_text_safe(filepath)
                file_contents[file_id] = content
                edges = parse_imports(file_id, content, known_files, go_module=go_module)
                all_edges.extend(edges)
            except Exception as e:
                await sync_issues.record_issue(
                    sync_id, "warning", "parsing", "parse_failed",
                    f"Could not parse {file_id}", {"file_path": file_id, "error": str(e)})
            done = i + 1
            meta["files_parsed"] = done
            meta["edges_found"] = len(all_edges)
            if done % CANCELLATION_POLL_EVERY_N == 0 or done == len(parseable):
                await sync_runs.update_sync_progress(sync_id, done, len(nodes), meta)
                await _check_cancelled(sync_id)

        edge_count_by_source: dict[str, int] = {}
        for edge in all_edges:
            edge_count_by_source[edge.source_id] = edge_count_by_source.get(edge.source_id, 0) + 1

        meta["phase"] = "preparing"
        await sync_runs.update_sync_progress(sync_id, 0, len(nodes), meta)

        file_info_list: list[dict] = []
        for node in nodes:
            filepath = os.path.join(tree.root_dir, node.id)
            content = file_contents.get(node.id, "")
            if not content:
                content = _read_text_safe(filepath)
            language = _detect_language(node.id)
            line_count = content.count("\n") + 1 if content else 0
            size_bytes = len(content.encode("utf-8", errors="replace")) if content else 0
            content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest() if content else None
            summary = file_summary_text(node.id, node.type, language, content)
            chunks = chunk_file(content, settings.chunk_size, settings.chunk_overlap) if content.strip() else []
            file_info_list.append({
                "node": node, "content": content, "language": language,
                "line_count": line_count, "size_bytes": size_bytes,
                "content_hash": content_hash,
                "summary": summary, "chunks": chunks,
                "imports_count": edge_count_by_source.get(node.id, 0),
            })

        total_chunks = sum(len(fi["chunks"]) for fi in file_info_list)
        meta["chunks_total"] = total_chunks

        meta["phase"] = "graphing"
        await sync_runs.update_sync_progress(sync_id, 0, len(nodes), meta)

        file_id_map: dict[str, str] = {}
        for fi_idx, fi in enumerate(file_info_list):
            node = fi["node"]
            file_db_id = await graph_writer.insert_file(
                sync_id=sync_id, source_id=source_id,
                file_path=node.id, name=node.name, file_type=node.type,
                domain=node.domain, language=fi["language"],
                size_bytes=fi["size_bytes"], line_count=fi["line_count"],
                imports_count=fi["imports_count"],
                content_hash=fi["content_hash"],
            )
            file_id_map[node.id] = file_db_id

            chunk_dicts = [{
                "chunk_index": ch.chunk_index, "content": ch.content,
                "start_line": ch.start_line, "end_line": ch.end_line,
                "token_count": ch.token_count, "language": fi["language"],
                "embedding": None,
            } for ch in fi["chunks"]]
            if chunk_dicts:
                await graph_writer.insert_chunks(file_db_id, sync_id, chunk_dicts)

            done = fi_idx + 1
            if done % CANCELLATION_POLL_EVERY_N == 0 or done == len(file_info_list):
                await sync_runs.update_sync_progress(sync_id, done, len(nodes), meta)
                await _check_cancelled(sync_id)

        age_nodes = [
            {"file_id": file_id_map[node.id], "name": node.name,
             "type": node.type, "domain": node.domain}
            for node in nodes if node.id in file_id_map
        ]
        node_failures = await graph_writer.write_age_nodes(age_nodes, sync_id, source_id)
        if node_failures:
            await sync_issues.record_issue(
                sync_id, "warning", "graphing", "age_node_partial_failure",
                f"{node_failures} of {len(age_nodes)} AGE nodes failed to write",
                {"failed": node_failures, "total": len(age_nodes)})

        age_edges = [
            {"source_id": file_id_map[edge.source_id],
             "target_id": file_id_map[edge.target_id], "weight": 1.0}
            for edge in all_edges
            if edge.source_id in file_id_map and edge.target_id in file_id_map
        ]
        edge_failures = await graph_writer.write_age_edges(age_edges, sync_id, source_id)
        if edge_failures:
            await sync_issues.record_issue(
                sync_id, "warning", "graphing", "age_edge_partial_failure",
                f"{edge_failures} of {len(age_edges)} AGE edges failed to write",
                {"failed": edge_failures, "total": len(age_edges)})
        await _check_cancelled(sync_id)

        meta["phase"] = "embedding_summaries"
        summary_texts = [fi["summary"] for fi in file_info_list]
        try:
            for batch_start in range(0, len(summary_texts), EMBED_BATCH_SIZE):
                batch = summary_texts[batch_start:batch_start + EMBED_BATCH_SIZE]
                vectors = await embed_batch(batch)
                for j, vec in enumerate(vectors):
                    if vec is None:
                        await sync_issues.record_issue(
                            sync_id, "warning", "embedding_summaries", "embedding_null",
                            "Embedding server returned null for file",
                            {"file_path": file_info_list[batch_start + j]["node"].id})
                        continue
                    fi = file_info_list[batch_start + j]
                    file_db_id = file_id_map.get(fi["node"].id)
                    if file_db_id:
                        await graph_writer.update_file_embedding(file_db_id, vec, sync_id=sync_id)
                meta["files_embedded"] = min(batch_start + EMBED_BATCH_SIZE, len(summary_texts))
                await sync_runs.update_sync_progress(sync_id, meta["files_embedded"], len(nodes), meta)
                await _check_cancelled(sync_id)
        except CancelledSync:
            raise
        except EmbeddingDimError:
            raise
        except Exception as e:
            await sync_issues.record_issue(
                sync_id, "warning", "embedding_summaries", "embedding_unavailable",
                f"Embedding server unreachable: {e}", {})

        meta["phase"] = "embedding_chunks"
        all_chunk_texts: list[str] = []
        chunk_map: list[tuple[str, int]] = []
        for fi in file_info_list:
            file_db_id = file_id_map.get(fi["node"].id)
            if not file_db_id:
                continue
            for ch in fi["chunks"]:
                all_chunk_texts.append(ch.content)
                chunk_map.append((file_db_id, ch.chunk_index))

        if all_chunk_texts:
            try:
                for batch_start in range(0, len(all_chunk_texts), EMBED_BATCH_SIZE):
                    batch = all_chunk_texts[batch_start:batch_start + EMBED_BATCH_SIZE]
                    vectors = await embed_batch(batch)
                    for j, vec in enumerate(vectors):
                        if vec is None:
                            continue
                        file_db_id, chunk_index = chunk_map[batch_start + j]
                        await graph_writer.update_chunk_embedding(file_db_id, chunk_index, vec, sync_id=sync_id)
                    meta["chunks_embedded"] = min(batch_start + EMBED_BATCH_SIZE, len(all_chunk_texts))
                    await sync_runs.update_sync_progress(sync_id, meta["files_embedded"], len(nodes), meta)
                    await _check_cancelled(sync_id)
            except CancelledSync:
                raise
            except EmbeddingDimError:
                raise
            except Exception as e:
                await sync_issues.record_issue(
                    sync_id, "warning", "embedding_chunks", "embedding_unavailable",
                    f"Chunk embedding failed: {e}", {})

        meta["phase"] = "done"
        await sync_runs.update_sync_progress(sync_id, len(nodes), len(nodes), meta)
        sync_elapsed = time.monotonic() - sync_start
        stats = {
            "nodes": len(age_nodes), "edges": len(age_edges),
            "files_embedded": meta["files_embedded"],
            "chunks": total_chunks, "chunks_embedded": meta.get("chunks_embedded", 0),
            "duration_ms": round(sync_elapsed * 1000),
        }
        await sync_runs.complete_sync_run(sync_id, stats)
        await sync_runs.update_source_last_sync(source_id, sync_id)
        logger.info("sync_completed", sync_id=sync_id, **stats)

    except CancelledSync:
        logger.info("sync_cancelled", sync_id=sync_id)
        await graph_writer.cleanup_partial(sync_id)
    except Exception as e:
        logger.error("sync_failed", sync_id=sync_id, error=str(e))
        await graph_writer.cleanup_partial(sync_id)
        await sync_runs.fail_sync_run(sync_id, str(e))
    finally:
        if tree and tree.root_dir:
            shutil.rmtree(tree.root_dir, ignore_errors=True)
