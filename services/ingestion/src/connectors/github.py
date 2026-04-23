import asyncio
import os
import shutil
import tempfile
import time

import httpx
import structlog

from src.connectors.base import MaterializedTree, SourceConnector
from src.config import settings

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"


# ---------- HTTP client ----------

_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=settings.github_api_max_connections,
                max_keepalive_connections=settings.github_api_max_keepalive_connections,
            ),
            timeout=httpx.Timeout(
                connect=settings.github_api_timeout_connect_s,
                read=settings.github_api_timeout_read_s,
                write=settings.github_api_timeout_write_s,
                pool=settings.github_api_timeout_pool_s,
            ),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None

async def fetch_repo_metadata(owner: str, repo: str, token: str) -> dict:
    """Fetch public metadata from the GitHub REST API. Returns an empty dict on failure."""
    client = await get_client()
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    try:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return {
            "description": data.get("description") or "",
            "stars": data.get("stargazers_count") or 0,
            "forks": data.get("forks_count") or 0,
            "open_issues": data.get("open_issues_count") or 0,
            "language": data.get("language") or "",
            "topics": data.get("topics", []),
            "license": (data.get("license") or {}).get("name") or "",
            "default_branch": data.get("default_branch") or "",
            "created_at": data.get("created_at") or "",
            "updated_at": data.get("updated_at") or "",
            "pushed_at": data.get("pushed_at") or "",
        }
    except Exception:
        return {}


async def fetch_commit_date(owner: str, repo: str, ref: str, token: str) -> str | None:
    """Fetch the committer date for a given ref. Returns None on failure."""
    client = await get_client()
    url = f"{GITHUB_API}/repos/{owner}/{repo}/commits/{ref}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    try:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data.get("commit", {}).get("committer", {}).get("date")
    except Exception:
        return None


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


# ---------- SourceConnector wrapper ----------


class GitHubConnector:
    """SourceConnector implementation for github_repo source type."""

    async def materialize(self, source: dict, scratch_dir: str) -> MaterializedTree:
        owner = source["owner"]
        repo = source["name"]
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
