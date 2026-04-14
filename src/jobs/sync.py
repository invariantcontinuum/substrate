import os
import time
import shutil
import structlog
from src.config import settings
from src.connectors.github import (
    _clone_repo, _walk_local_tree, parse_repo_tree, parse_imports,
    PARSEABLE_EXTENSIONS,
)
from src.schema import GraphEvent, EdgeAffected, parse_repo_url
from src.db import get_pool
from src.chunker import chunk_file, file_summary_text
from src.graph_writer import (
    upsert_repository, upsert_file, insert_chunks,
    write_age_nodes, write_age_edges,
)
from src.llm import embed_batch

logger = structlog.get_logger()

EMBED_BATCH_SIZE = 32

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


async def handle_sync(scope: dict, on_progress) -> None:
    owner = scope.get("owner", "")
    repo = scope.get("repo", "")
    repo_url = scope.get("repo_url", "")

    if repo_url and not (owner and repo):
        owner, repo = parse_repo_url(repo_url)

    if not owner or not repo:
        raise ValueError("scope must include owner+repo or repo_url")

    repo_label = f"{owner}/{repo}"
    sync_start = time.monotonic()
    logger.info("sync_started", owner=owner, repo=repo)
    meta = {
        "phase": "cloning", "repo": repo_label,
        "files_total": 0, "files_parseable": 0,
        "files_parsed": 0, "files_embedded": 0,
        "chunks_total": 0, "chunks_embedded": 0,
        "edges_found": 0, "nodes_by_type": {},
    }
    await on_progress(0, 0, meta)

    # ── 1. Clone ──
    logger.info("sync_phase_cloning", owner=owner, repo=repo)
    clone_start = time.monotonic()
    tmpdir = await _clone_repo(owner, repo, settings.github_token)
    clone_elapsed = time.monotonic() - clone_start
    logger.info("clone_complete", owner=owner, repo=repo,
                duration_ms=round(clone_elapsed * 1000))

    try:
        # ── 2. Discover files ──
        logger.info("sync_phase_discovering")
        meta["phase"] = "discovering"
        await on_progress(0, 0, meta)

        tree = _walk_local_tree(tmpdir)
        nodes = parse_repo_tree(tree)
        known_files = {n.id for n in nodes}

        type_counts: dict[str, int] = {}
        for n in nodes:
            type_counts[n.type] = type_counts.get(n.type, 0) + 1

        parseable = [
            n.id for n in nodes
            if "." in n.id and "." + n.id.rsplit(".", 1)[-1] in PARSEABLE_EXTENSIONS
        ]

        meta.update({
            "files_total": len(nodes),
            "files_parseable": len(parseable),
            "nodes_by_type": type_counts,
        })
        await on_progress(0, len(nodes), meta)
        logger.info("discovery_complete", files_total=len(nodes),
                     files_parseable=len(parseable), types=type_counts)

        # ── 3. Parse imports ──
        logger.info("sync_phase_parsing", files_to_parse=len(parseable))
        meta["phase"] = "parsing"
        all_edges: list[EdgeAffected] = []
        file_contents: dict[str, str] = {}

        for i, file_id in enumerate(parseable):
            filepath = os.path.join(tmpdir, file_id)
            try:
                with open(filepath, "r", errors="replace") as f:
                    content = f.read()
                file_contents[file_id] = content
                edges = parse_imports(file_id, content, known_files)
                all_edges.extend(edges)
            except Exception:
                pass

            done = i + 1
            meta["files_parsed"] = done
            meta["edges_found"] = len(all_edges)
            if done % 50 == 0 or done == len(parseable):
                await on_progress(done, len(nodes), meta)

        logger.info("parsing_complete", files_parsed=len(parseable), edges_found=len(all_edges))

        # Build edge lookup for imports_count per file
        edge_count_by_source: dict[str, int] = {}
        for edge in all_edges:
            edge_count_by_source[edge.source_id] = edge_count_by_source.get(edge.source_id, 0) + 1

        # ── 4. Upsert repository ──
        repo_id = await upsert_repository(
            owner, repo, f"https://github.com/{owner}/{repo}",
            total_files=len(nodes), total_edges=len(all_edges),
        )

        # ── 5. Build summaries + chunks for all files ──
        logger.info("sync_phase_embedding", total_files=len(nodes))
        meta["phase"] = "embedding"
        await on_progress(0, len(nodes), meta)

        # Collect file info for all nodes (not just parseable)
        file_info_list: list[dict] = []
        for node in nodes:
            filepath = os.path.join(tmpdir, node.id)
            content = file_contents.get(node.id, "")
            if not content:
                try:
                    with open(filepath, "r", errors="replace") as f:
                        content = f.read()
                except Exception:
                    content = ""

            language = _detect_language(node.id)
            line_count = content.count("\n") + 1 if content else 0
            size_bytes = len(content.encode("utf-8", errors="replace")) if content else 0

            summary = file_summary_text(node.id, node.type, language, content)
            chunks = chunk_file(content, settings.chunk_size, settings.chunk_overlap) if content.strip() else []

            file_info_list.append({
                "node": node,
                "content": content,
                "language": language,
                "line_count": line_count,
                "size_bytes": size_bytes,
                "summary": summary,
                "chunks": chunks,
                "imports_count": edge_count_by_source.get(node.id, 0),
            })

        total_chunks = sum(len(fi["chunks"]) for fi in file_info_list)
        meta["chunks_total"] = total_chunks

        # ── 6. Batch embed file summaries ──
        embedding_available = True
        summary_texts = [fi["summary"] for fi in file_info_list]
        summary_embeddings: list[list[float] | None] = [None] * len(summary_texts)

        embed_start = time.monotonic()
        file_batches_total = (len(summary_texts) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
        try:
            for batch_start in range(0, len(summary_texts), EMBED_BATCH_SIZE):
                batch = summary_texts[batch_start:batch_start + EMBED_BATCH_SIZE]
                vectors = await embed_batch(batch)
                for j, vec in enumerate(vectors):
                    summary_embeddings[batch_start + j] = vec
                meta["files_embedded"] = min(batch_start + EMBED_BATCH_SIZE, len(summary_texts))
                batch_num = batch_start // EMBED_BATCH_SIZE + 1
                logger.info("embedding_file_batch_complete", batch=batch_num,
                            total_batches=file_batches_total,
                            files_embedded=meta["files_embedded"])
                await on_progress(meta["files_embedded"], len(nodes), meta)
        except Exception as e:
            logger.warning("embedding_unavailable", error=str(e))
            embedding_available = False
            meta["files_embedded"] = 0

        # Batch embed chunks — build index for fast lookup
        all_chunk_texts: list[str] = []
        chunk_map: list[tuple[int, int]] = []  # (file_index, chunk_index_in_file)
        chunk_global_idx: dict[tuple[int, int], int] = {}  # (fi_idx, ch_idx) -> global index
        for fi_idx, fi in enumerate(file_info_list):
            for ch_idx, ch in enumerate(fi["chunks"]):
                chunk_global_idx[(fi_idx, ch_idx)] = len(all_chunk_texts)
                all_chunk_texts.append(ch.content)
                chunk_map.append((fi_idx, ch_idx))

        chunk_embeddings: list[list[float] | None] = [None] * len(all_chunk_texts)
        chunk_batches_total = (len(all_chunk_texts) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE if all_chunk_texts else 0
        if embedding_available and all_chunk_texts:
            logger.info("embedding_chunks_start", total_chunks=len(all_chunk_texts),
                        total_batches=chunk_batches_total)
            try:
                for batch_start in range(0, len(all_chunk_texts), EMBED_BATCH_SIZE):
                    batch = all_chunk_texts[batch_start:batch_start + EMBED_BATCH_SIZE]
                    vectors = await embed_batch(batch)
                    for j, vec in enumerate(vectors):
                        chunk_embeddings[batch_start + j] = vec
                    meta["chunks_embedded"] = min(batch_start + EMBED_BATCH_SIZE, len(all_chunk_texts))
                    batch_num = batch_start // EMBED_BATCH_SIZE + 1
                    logger.info("embedding_chunk_batch_complete", batch=batch_num,
                                total_batches=chunk_batches_total,
                                chunks_embedded=meta["chunks_embedded"])
                    await on_progress(meta["files_embedded"], len(nodes), meta)
            except Exception as e:
                logger.warning("chunk_embedding_failed", error=str(e))
                meta["chunks_embedded"] = 0

        embed_elapsed = time.monotonic() - embed_start
        logger.info("embedding_complete",
                     files_embedded=meta["files_embedded"],
                     chunks_embedded=meta["chunks_embedded"],
                     duration_ms=round(embed_elapsed * 1000))

        # ── 7. Write file_embeddings + content_chunks to substrate_graph ──
        logger.info("sync_phase_graphing", total_files=len(nodes))
        meta["phase"] = "graphing"
        await on_progress(0, len(nodes), meta)

        file_id_map: dict[str, str] = {}
        for fi_idx, fi in enumerate(file_info_list):
            node = fi["node"]
            file_db_id = await upsert_file(
                repo_id=repo_id,
                file_path=node.id,
                name=node.name,
                file_type=node.type,
                domain=node.domain,
                language=fi["language"],
                size_bytes=fi["size_bytes"],
                line_count=fi["line_count"],
                imports_count=fi["imports_count"],
                embedding=summary_embeddings[fi_idx],
            )
            file_id_map[node.id] = file_db_id

            # Insert every chunk — keep the content even when its
            # embedding is missing so the summary endpoint and full-text
            # search still have something to work with. The embedding
            # column is nullable (V5 migration) so chunks without a
            # vector just won't participate in semantic search.
            chunk_dicts: list[dict] = []
            for ch_idx, ch in enumerate(fi["chunks"]):
                global_idx = chunk_global_idx.get((fi_idx, ch_idx))
                emb = chunk_embeddings[global_idx] if global_idx is not None else None
                chunk_dicts.append({
                    "chunk_index": ch.chunk_index,
                    "content": ch.content,
                    "start_line": ch.start_line,
                    "end_line": ch.end_line,
                    "token_count": ch.token_count,
                    "language": fi["language"],
                    "embedding": emb,
                })
            if chunk_dicts:
                await insert_chunks(file_db_id, chunk_dicts)

            done = fi_idx + 1
            if done % 50 == 0 or done == len(file_info_list):
                await on_progress(done, len(nodes), meta)

        logger.info("relational_writes_complete", files=len(file_id_map))

        # ── 8. Write AGE nodes + edges ──
        age_nodes = [
            {
                "file_id": file_id_map[node.id],
                "name": node.name,
                "type": node.type,
                "domain": node.domain,
            }
            for node in nodes if node.id in file_id_map
        ]
        await write_age_nodes(age_nodes)

        age_edges = [
            {
                "source_id": file_id_map[edge.source_id],
                "target_id": file_id_map[edge.target_id],
                "weight": 1.0,
            }
            for edge in all_edges
            if edge.source_id in file_id_map and edge.target_id in file_id_map
        ]
        await write_age_edges(age_edges)
        logger.info("age_writes_complete", nodes=len(age_nodes), edges=len(age_edges))

        # ── 9. Store raw_event in substrate_ingestion ──
        event = GraphEvent(
            source="github", event_type="sync",
            nodes_affected=nodes, edges_affected=all_edges,
        )
        pool = await get_pool()
        await pool.execute(
            "INSERT INTO raw_events (source, event_type, payload) VALUES ($1, $2, $3)",
            "github", "sync", event.model_dump_json(),
        )

        # ── 10. Done ──
        meta["phase"] = "done"
        await on_progress(len(nodes), len(nodes), meta)
        sync_elapsed = time.monotonic() - sync_start
        logger.info("sync_job_complete", owner=owner, repo=repo,
                     nodes=len(nodes), edges=len(all_edges),
                     chunks=total_chunks, files_embedded=meta["files_embedded"],
                     chunks_embedded=meta.get("chunks_embedded", 0),
                     duration_ms=round(sync_elapsed * 1000))

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
