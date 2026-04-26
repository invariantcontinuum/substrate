import hashlib
import os
import shutil
import time
from datetime import datetime, timezone
from typing import Any

import structlog
from src.config import settings
from src.connectors.base import MaterializedTree
from src.connectors.github import CONNECTORS, _walk_local_tree, fetch_commit_date, fetch_repo_metadata
from src import graph_writer, sync_runs, sync_issues
from src.chunker import chunk_file, file_summary_text
from src.jobs.finalize_stats import finalize_stats
from src.jobs.per_sync_leiden import per_sync_leiden
from src.llm import embed_batch, EmbeddingDimError
from substrate_graph_builder import build_graph

logger = structlog.get_logger()


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
    except (OSError, UnicodeDecodeError):
        return ""


def _as_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    return 0


def _derive_progress(meta: dict[str, Any]) -> tuple[int, int]:
    phase = str(meta.get("phase") or "")
    files_total = _as_int(meta.get("files_total"))
    files_embedded = _as_int(meta.get("files_embedded"))
    chunks_total = _as_int(meta.get("chunks_total"))
    chunks_embedded = _as_int(meta.get("chunks_embedded"))

    if phase == "embedding_chunks":
        return chunks_embedded, chunks_total
    if phase == "embedding_summaries":
        return files_embedded, files_total
    if phase == "done":
        if chunks_total > 0:
            return chunks_total, chunks_total
        return files_total, files_total
    return 0, files_total


async def _publish_progress(
    sync_id: str,
    meta: dict[str, Any],
    *,
    done: int | None = None,
    total: int | None = None,
) -> None:
    if done is None or total is None:
        done, total = _derive_progress(meta)
    await sync_runs.update_sync_progress(sync_id, done, total, meta)


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

    meta: dict[str, Any] = {
        "phase": "cloning", "source": label,
        "files_total": 0, "files_parseable": 0,
        "files_parsed": 0, "files_embedded": 0,
        "chunks_total": 0, "chunks_embedded": 0,
        "edges_found": 0, "nodes_by_type": {},
    }
    await _publish_progress(sync_id, meta, done=0, total=0)

    tree: MaterializedTree | None = None
    last_commit_at: str | None = None
    # Resume-cursor state (Task 7). When the sync row carries a cursor from
    # a prior failed/cancelled run, we pin the commit_sha the parent was
    # working against and skip files the parent already finished. The cursor
    # is rewritten at every per-file batch boundary so a crash here leaves
    # a usable resume point for POST /api/syncs/{id}/resync.
    existing_cursor = await sync_runs.get_resume_cursor(sync_id)
    processed_paths: set[str] = set(
        existing_cursor.get("processed_paths", []) if existing_cursor else []
    )
    pinned_commit_sha: str | None = (
        existing_cursor.get("commit_sha") if existing_cursor else None
    )
    try:
        tree = await connector.materialize(source, scratch_dir="/tmp")
        if pinned_commit_sha:
            # Resume mode: the parent already committed work tied to that
            # exact commit; resume must FINISH that work, not start a new
            # attempt at HEAD. Override the freshly-cloned ref so all
            # downstream writes (sync_runs.ref, file_embeddings.last_commit_sha)
            # stay coherent with the parent's progress.
            tree = MaterializedTree(
                root_dir=tree.root_dir,
                file_paths=tree.file_paths,
                ref=pinned_commit_sha,
            )
        if tree.ref:
            await sync_runs.set_ref(sync_id, tree.ref)
            if source_type == "github_repo":
                try:
                    repo_meta = await fetch_repo_metadata(
                        source["owner"], source["name"], settings.github_token
                    )
                    if repo_meta:
                        await graph_writer.update_source_meta(
                            source_id, repo_meta,
                            default_branch=repo_meta.get("default_branch"),
                        )
                    commit_date = await fetch_commit_date(
                        source["owner"], source["name"], tree.ref, settings.github_token
                    )
                    if commit_date:
                        last_commit_at = commit_date
                except Exception:
                    pass
        await _check_cancelled(sync_id)

        meta["phase"] = "discovering"
        await _publish_progress(sync_id, meta, done=0, total=0)

        # Delegate discovery + import parsing to substrate_graph_builder.
        # build_graph emits file nodes (ids without '#') + symbol nodes
        # (ids with '#') + `depends` file→file edges + `defines`
        # file→symbol edges. All four flow through to AGE below: files as
        # :File, symbols as :Symbol, depends as :DEPENDS_ON, defines as
        # :DEFINES. `nodes` / `all_edges` below remain file-scoped for
        # back-compat with downstream code that reads them for file_id
        # mapping, embeddings, stats, etc.
        local_tree = _walk_local_tree(tree.root_dir)
        doc = build_graph(local_tree, tree.root_dir, source_name="github")
        denied_count = doc.stats.get("denied_file_count", 0) if hasattr(doc, "stats") else 0
        file_nodes = [n for n in doc.nodes if "#" not in n.id]
        symbol_nodes = [n for n in doc.nodes if "#" in n.id]
        depends_edges = [e for e in doc.edges if e.type == "depends"]
        defines_edges = [e for e in doc.edges if e.type == "defines"]
        # Variables kept for back-compat with later code that references them:
        nodes = file_nodes
        all_edges = depends_edges
        exports_by_file: dict[str, list[str]] = {}
        for n in symbol_nodes:
            fp = n.meta.get("file_path", "")
            if fp:
                exports_by_file.setdefault(fp, []).append(n.name)
        type_counts: dict[str, int] = {}
        for n in nodes:
            type_counts[n.type] = type_counts.get(n.type, 0) + 1
        # `files_parseable` was historically derived from a static
        # extension list; today it's the distinct set of file ids that
        # the builder produced analysis for (i.e. every file whose plugin
        # emitted at least one import-edge OR that matched a registered
        # plugin). Use the full plugin-covered set as an upper bound by
        # asking the registry; no coupling to legacy constants.
        from substrate_graph_builder import REGISTRY
        parseable = [n.id for n in nodes if REGISTRY.get_for_path(n.id) is not None]
        meta.update({"files_total": len(nodes), "files_parseable": len(parseable),
                     "nodes_by_type": type_counts, "edges_found": len(all_edges),
                     "files_parsed": len(parseable)})
        await _publish_progress(sync_id, meta, done=0, total=len(nodes))
        await _check_cancelled(sync_id)

        edge_count_by_source: dict[str, int] = {}
        for edge in all_edges:
            edge_count_by_source[edge.source_id] = edge_count_by_source.get(edge.source_id, 0) + 1

        meta["phase"] = "preparing"
        await _publish_progress(sync_id, meta, done=0, total=len(nodes))

        # The builder already read file contents once for tree-sitter
        # parsing; we re-read here so chunking / hashing / summary
        # generation don't depend on the builder's internal byte buffer.
        file_info_list: list[dict] = []
        for node in nodes:
            filepath = os.path.join(tree.root_dir, node.id)
            content = _read_text_safe(filepath)
            language = _detect_language(node.id)
            size_bytes = len(content.encode("utf-8", errors="replace")) if content else 0
            content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest() if content else None
            summary = file_summary_text(node.id, node.type, language, content)
            if content.strip():
                chunk_result = chunk_file(
                    node.id, content,
                    settings.chunk_size, settings.chunk_overlap,
                    return_metadata=True,
                )
                chunks = chunk_result["chunks"]
                line_count = chunk_result["total_lines"]
            else:
                chunks = []
                line_count = (
                    content.count("\n") + (0 if content.endswith("\n") else 1)
                    if content else 0
                )
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
        await _publish_progress(sync_id, meta, done=0, total=len(nodes))

        file_id_map: dict[str, str] = {}
        all_paths = [fi["node"].id for fi in file_info_list]
        # Track which paths are processed in this sync so the resume cursor
        # can be rewritten at every batch boundary. On a fresh sync this set
        # starts empty; on resume it inherits the parent's set so skipped
        # files remain marked done in the cursor.
        cursor_processed: set[str] = set(processed_paths)
        for fi_idx, fi in enumerate(file_info_list):
            node = fi["node"]
            if node.id in processed_paths:
                # Resume mode: parent already committed this file under its
                # sync_id. Skip it so we only finish the unprocessed tail.
                continue
            file_db_id = await graph_writer.insert_file(
                sync_id=sync_id, source_id=source_id,
                file_path=node.id, name=node.name, file_type=node.type,
                domain=node.domain, language=fi["language"],
                size_bytes=fi["size_bytes"], line_count=fi["line_count"],
                imports_count=fi["imports_count"],
                content_hash=fi["content_hash"],
                exports=exports_by_file.get(node.id),
                last_commit_sha=tree.ref or None,
                last_commit_at=last_commit_at,
                description=fi["summary"],
            )
            file_id_map[node.id] = file_db_id

            chunk_dicts = [{
                "chunk_index": ch.chunk_index, "content": ch.content,
                "start_line": ch.start_line, "end_line": ch.end_line,
                "token_count": ch.token_count,
                "language": ch.language or fi["language"],
                "chunk_type": ch.chunk_type,
                "symbols": ch.symbols,
                "embedding": None,
            } for ch in fi["chunks"]]
            if chunk_dicts:
                await graph_writer.insert_chunks(file_db_id, sync_id, chunk_dicts)

            cursor_processed.add(node.id)
            done = fi_idx + 1
            if done % settings.sync_cancellation_poll_every_n == 0 or done == len(file_info_list):
                await _publish_progress(sync_id, meta, done=done, total=len(nodes))
                # Persist a checkpoint at every batch boundary. A crash here
                # leaves the row with a usable cursor for POST /resync.
                await sync_runs.set_resume_cursor(sync_id, {
                    "commit_sha": tree.ref or "",
                    "tree_total_paths": len(all_paths),
                    "processed_paths": sorted(cursor_processed),
                    "last_batch_finished_at": datetime.now(timezone.utc).isoformat(),
                })
                await _check_cancelled(sync_id)

        age_nodes = [
            {"file_id": file_id_map[node.id], "name": node.name,
             "type": node.type, "domain": node.domain}
            for node in nodes if node.id in file_id_map
        ]
        # Surface nodes_total / edges_total in progress_meta so the UI's
        # stats panel can show live counts while the sync is still running
        # instead of em-dashing every field until complete_sync_run fires.
        meta["nodes_total"] = len(age_nodes)
        node_failures = await graph_writer.write_age_nodes(age_nodes, sync_id, source_id)
        if node_failures:
            await sync_issues.record_issue(
                sync_id, "warning", "graphing", "age_node_partial_failure",
                f"{node_failures} of {len(age_nodes)} AGE nodes failed to write",
                {"failed": node_failures, "total": len(age_nodes)})

        # Symbol nodes are keyed on the synthetic `{file_path}#{name}@{line}`
        # id produced by the graph-builder (stored as :Symbol.symbol_id).
        # file_path is carried as a property for debugging and for any future
        # read-API paths that want to surface it without following DEFINES.
        symbol_node_dicts = [
            {
                "symbol_id": n.id,
                "file_path": n.meta["file_path"],
                "name": n.name,
                "kind": n.type,
                "line": n.meta["line"],
                "domain": n.domain,
            }
            for n in symbol_nodes
        ]
        meta["symbol_count"] = len(symbol_nodes)
        symbol_failures = await graph_writer.write_age_symbol_nodes(
            symbol_node_dicts, sync_id, source_id
        )
        if symbol_failures:
            await sync_issues.record_issue(
                sync_id, "warning", "graphing", "age_symbol_node_partial_failure",
                f"{symbol_failures} of {len(symbol_node_dicts)} AGE Symbol nodes failed to write",
                {"failed": symbol_failures, "total": len(symbol_node_dicts)})

        age_edges = [
            {"source_id": file_id_map[edge.source_id],
             "target_id": file_id_map[edge.target_id], "weight": 1.0}
            for edge in all_edges
            if edge.source_id in file_id_map and edge.target_id in file_id_map
        ]
        meta["edges_total"] = len(age_edges)
        edge_failures = await graph_writer.write_age_edges(age_edges, sync_id, source_id)
        if edge_failures:
            await sync_issues.record_issue(
                sync_id, "warning", "graphing", "age_edge_partial_failure",
                f"{edge_failures} of {len(age_edges)} AGE edges failed to write",
                {"failed": edge_failures, "total": len(age_edges)})

        # DEFINES edges connect :File (by UUID file_id) to :Symbol (by
        # synthetic `{path}#{name}@{line}` symbol_id). The defines edge
        # source_id coming out of the builder is the repo-relative path,
        # so we map it through `file_id_map` to the file_embeddings UUID
        # that :File.file_id carries. The target_id passes through
        # untouched — :Symbol.symbol_id equals the builder's node id.
        defines_edge_dicts = [
            {"source_id": file_id_map[e.source_id], "target_id": e.target_id}
            for e in defines_edges
            if e.source_id in file_id_map
        ]
        meta["defines_edges"] = len(defines_edges)
        defines_failures = await graph_writer.write_age_defines_edges(
            defines_edge_dicts, sync_id, source_id
        )
        if defines_failures:
            await sync_issues.record_issue(
                sync_id, "warning", "graphing", "age_defines_edge_partial_failure",
                f"{defines_failures} of {len(defines_edge_dicts)} AGE DEFINES edges failed to write",
                {"failed": defines_failures, "total": len(defines_edge_dicts)})
        await _check_cancelled(sync_id)

        meta["phase"] = "embedding_summaries"
        # Persist nodes_total / edges_total / new phase in one write so the
        # stats panel sees them before the first embedding batch lands.
        await _publish_progress(sync_id, meta)
        summary_texts = [fi["summary"] for fi in file_info_list]
        try:
            for batch_start in range(0, len(summary_texts), settings.embed_batch_size):
                batch = summary_texts[batch_start:batch_start + settings.embed_batch_size]
                vectors = await embed_batch(batch)
                for j, vec in enumerate(vectors):
                    if vec is None:
                        await sync_issues.record_issue(
                            sync_id, "warning", "embedding_summaries", "embedding_null",
                            "Embedding server returned null for file",
                            {"file_path": file_info_list[batch_start + j]["node"].id})
                        continue
                    fi = file_info_list[batch_start + j]
                    maybe_file_db_id = file_id_map.get(fi["node"].id)
                    if maybe_file_db_id:
                        await graph_writer.update_file_embedding(
                            maybe_file_db_id, vec, sync_id=sync_id
                        )
                meta["files_embedded"] = min(
                    batch_start + settings.embed_batch_size,
                    len(summary_texts),
                )
                await _publish_progress(sync_id, meta)
                await _check_cancelled(sync_id)
        except CancelledSync:
            raise
        except EmbeddingDimError:
            raise
        except Exception as e:  # noqa: BLE001 — embedding fallback records issue and continues
            await sync_issues.record_issue(
                sync_id, "warning", "embedding_summaries", "embedding_unavailable",
                f"Embedding server unreachable: {e}", {})

        meta["phase"] = "embedding_chunks"
        await _publish_progress(sync_id, meta)
        all_chunk_texts: list[str] = []
        chunk_map: list[tuple[str, int]] = []
        for fi in file_info_list:
            fi_file_db_id = file_id_map.get(fi["node"].id)
            if not fi_file_db_id:
                continue
            for ch in fi["chunks"]:
                all_chunk_texts.append(ch.content)
                chunk_map.append((fi_file_db_id, ch.chunk_index))

        if all_chunk_texts:
            try:
                for batch_start in range(0, len(all_chunk_texts), settings.embed_batch_size):
                    batch = all_chunk_texts[batch_start:batch_start + settings.embed_batch_size]
                    vectors = await embed_batch(batch)
                    for j, vec in enumerate(vectors):
                        if vec is None:
                            continue
                        chunk_file_db_id, chunk_index = chunk_map[batch_start + j]
                        await graph_writer.update_chunk_embedding(
                            chunk_file_db_id, chunk_index, vec, sync_id=sync_id
                        )
                    meta["chunks_embedded"] = min(
                        batch_start + settings.embed_batch_size,
                        len(all_chunk_texts),
                    )
                    await _publish_progress(sync_id, meta)
                    await _check_cancelled(sync_id)
            except CancelledSync:
                raise
            except EmbeddingDimError:
                raise
            except Exception as e:  # noqa: BLE001 — chunk embedding fallback records issue and continues
                await sync_issues.record_issue(
                    sync_id, "warning", "embedding_chunks", "embedding_unavailable",
                    f"Chunk embedding failed: {e}", {})

        # Populate sync_runs.stats with counts/storage/timing/issues + per-sync
        # Leiden summary before the row flips to 'completed'. Both are non-failing:
        # on error they record a warning issue and leave the row usable with
        # stats.schema_version = 0 (UI handles the fallback). Spec §4.1.
        # Phase updates route through the existing _publish_progress path so the
        # SourcesPage UI sees "Finalising stats" and "Computing communities"
        # labels via the same SSE progress events as earlier phases.
        meta["phase"] = "finalizing_stats"
        try:
            await _publish_progress(sync_id, meta)
        except Exception as e:  # noqa: BLE001 — phase update is best-effort
            logger.warning("phase_update_failed",
                           sync_id=sync_id, phase="finalizing_stats", error=str(e))
        await finalize_stats(sync_id)

        meta["phase"] = "computing_communities"
        try:
            await _publish_progress(sync_id, meta)
        except Exception as e:  # noqa: BLE001 — phase update is best-effort
            logger.warning("phase_update_failed",
                           sync_id=sync_id, phase="computing_communities", error=str(e))
        await per_sync_leiden(sync_id)

        meta["phase"] = "done"
        await _publish_progress(sync_id, meta)
        sync_elapsed = time.monotonic() - sync_start
        stats = {
            "nodes": len(age_nodes), "edges": len(age_edges),
            "symbols": len(symbol_nodes), "defines_edges": len(defines_edges),
            "files_embedded": meta["files_embedded"],
            "chunks": total_chunks, "chunks_embedded": meta.get("chunks_embedded", 0),
            "duration_ms": round(sync_elapsed * 1000),
            "denied_file_count": denied_count,
        }
        await sync_runs.complete_sync_run(sync_id, stats)
        await sync_runs.update_source_last_sync(source_id, sync_id)
        logger.info("sync_completed", sync_id=sync_id, **stats)

    except CancelledSync:
        logger.info("sync_cancelled", sync_id=sync_id)
        await graph_writer.cleanup_partial(sync_id)
    except Exception as e:  # noqa: BLE001 — top-level sync failure path marks run failed + cleans partial graph
        logger.error("sync_failed", sync_id=sync_id, error=str(e))
        await graph_writer.cleanup_partial(sync_id)
        await sync_runs.fail_sync_run(sync_id, str(e))
    finally:
        if tree and tree.root_dir:
            shutil.rmtree(tree.root_dir, ignore_errors=True)
