import asyncio
import os
import shutil
import tempfile
import time
from typing import Any

import httpx
import structlog

from substrate_common.schema import GraphEvent, NodeAffected

from src.connectors.base import MaterializedTree, SourceConnector

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"
MAX_CONCURRENT_REQUESTS = 20


# ---------- HTTP client ----------

_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=20),
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


# ---------- GitHub API tree fetch ----------

async def fetch_repo_tree(owner: str, repo: str, token: str, branch: str = "master") -> list[dict]:
    client = await get_client()
    url = f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json().get("tree", [])


# ---------- Clone-based sync ----------

async def _clone_repo(owner: str, repo: str, token: str) -> str:
    """Shallow-clone a repo to a temp directory; return the path."""
    logger.info("clone_start", owner=owner, repo=repo)
    start = time.monotonic()
    tmpdir = tempfile.mkdtemp(prefix="substrate-sync-")
    url = f"https://x-access-token:{token}@github.com/{owner}/{repo}.git"
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", "--depth", "1", "--single-branch", "-q", url, tmpdir,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    elapsed = time.monotonic() - start
    if proc.returncode != 0:
        shutil.rmtree(tmpdir, ignore_errors=True)
        logger.error("clone_failed", owner=owner, repo=repo,
                     error=stderr.decode().strip(), duration_ms=round(elapsed * 1000))
        raise RuntimeError(f"git clone failed: {stderr.decode().strip()}")
    logger.info("clone_complete", owner=owner, repo=repo,
                duration_ms=round(elapsed * 1000))
    return tmpdir


def _walk_local_tree(repo_dir: str) -> list[dict]:
    """Walk a cloned repo and return entries compatible with the tree format
    consumed by substrate_graph_builder.build_graph."""
    logger.info("walk_tree_start", repo_dir=repo_dir)
    tree: list[dict] = []
    git_dir = os.path.join(repo_dir, ".git")
    for root, dirs, files in os.walk(repo_dir):
        # skip .git directory
        dirs[:] = [d for d in dirs if os.path.join(root, d) != git_dir]
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), repo_dir)
            tree.append({"path": rel, "type": "blob"})
    logger.info("walk_tree_complete", files_found=len(tree))
    return tree


async def sync_repo(
    owner: str, repo: str, token: str,
    on_progress=None,
) -> GraphEvent:
    logger.info("sync_started", owner=owner, repo=repo)
    repo_label = f"{owner}/{repo}"

    meta: dict[str, Any] = {
        "phase": "cloning", "repo": repo_label,
        "files_total": 0, "files_parseable": 0,
        "files_parsed": 0, "edges_found": 0,
        "nodes_by_type": {},
    }
    if on_progress:
        await on_progress(0, 0, meta)

    tmpdir = await _clone_repo(owner, repo, token)
    logger.info("clone_complete", owner=owner, repo=repo, path=tmpdir)

    try:
        meta["phase"] = "discovering"
        if on_progress:
            await on_progress(0, 0, meta)
        tree = _walk_local_tree(tmpdir)

        # Progress bridge: substrate_graph_builder calls on_progress sync;
        # our ingestion on_progress is async. Wrap it so the builder's sync
        # callback schedules the async one on the running loop.
        loop = asyncio.get_running_loop()

        def _sync_progress(done: int, total: int, bmeta: dict[str, Any]) -> None:
            # Merge builder's meta into ours without losing repo_label etc.
            merged = {**meta, **bmeta}
            if on_progress:
                asyncio.run_coroutine_threadsafe(on_progress(done, total, merged), loop)

        from substrate_graph_builder import build_graph
        doc = build_graph(
            tree, tmpdir,
            source_name="github",
            on_progress=_sync_progress,
        )

        meta.update({
            "files_total": sum(1 for n in doc.nodes if not n.id.count("#")),
            "nodes_by_type": _count_by_type(doc.nodes),
            "edges_found": len(doc.edges),
            "phase": "publishing",
        })
        if on_progress:
            await on_progress(len(doc.nodes), len(doc.nodes), meta)

        event = GraphEvent(
            source="github", event_type="sync",
            nodes_affected=doc.nodes, edges_affected=doc.edges,
        )
        logger.info("sync_complete", owner=owner, repo=repo,
                    nodes=len(doc.nodes), edges=len(doc.edges))
        return event

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _count_by_type(nodes: list[NodeAffected]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for n in nodes:
        counts[n.type] = counts.get(n.type, 0) + 1
    return counts


# ---------- SourceConnector wrapper ----------


class GitHubConnector:
    """SourceConnector implementation for github_repo source type."""

    async def materialize(self, source: dict, scratch_dir: str) -> MaterializedTree:
        owner = source["owner"]
        repo = source["name"]
        from src.config import settings
        tmpdir = await _clone_repo(owner, repo, settings.github_token)
        try:
            # We intentionally don't pre-walk the tree here — sync.py walks
            # once for the full NodeAffected list. file_paths stays empty
            # for the GitHub connector; future connectors that already know
            # their listing (e.g., a tar extract that produces a manifest)
            # can populate it.
            file_paths: list[str] = []
            ref = ""
            try:
                head_file = os.path.join(tmpdir, ".git", "HEAD")
                with open(head_file) as f:
                    head = f.read().strip()
                if head.startswith("ref: "):
                    ref_path = os.path.join(tmpdir, ".git", head[5:])
                    with open(ref_path) as f:
                        ref = f.read().strip()
                else:
                    ref = head
            except (OSError, UnicodeDecodeError) as e:
                logger.warning("github_ref_extract_failed", owner=owner, repo=repo, error=str(e))
            return MaterializedTree(root_dir=tmpdir, file_paths=file_paths, ref=ref)
        except Exception:  # noqa: BLE001 — clean up tmpdir on any post-clone failure then re-raise
            # Post-clone failure: clean up tmpdir so we don't leak. sync.py's
            # finally block can't help here because `tree` is still None at the
            # call site.
            shutil.rmtree(tmpdir, ignore_errors=True)
            raise


CONNECTORS: dict[str, SourceConnector] = {"github_repo": GitHubConnector()}
