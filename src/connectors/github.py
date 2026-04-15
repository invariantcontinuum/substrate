import re
import os
import time
import asyncio
import shutil
import tempfile
import httpx
import structlog
from src.schema import GraphEvent, NodeAffected, EdgeAffected

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"
MAX_CONCURRENT_REQUESTS = 20

IMPORT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (".c .h .cpp .hpp .cc", re.compile(r'#include\s+"([^"]+)"')),
    (".py", re.compile(r"(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))")),
    (".js .jsx .ts .tsx", re.compile(r"""(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))""")),
    (".go", re.compile(r'import\s+"([^"]+)"')),
    (".rs", re.compile(r"(?:use\s+(?:crate::)?([\w:]+)|mod\s+(\w+))")),
    (".pl .pm", re.compile(r"""(?:use\s+([\w:]+)|require\s+['"]([^'"]+)['"])""")),
    (".sh .bash", re.compile(r"""(?:source\s+['"]?([^'";\s]+)|\.(?:\s+)['"]?([^'";\s]+))""")),
    (".cmake", re.compile(r"(?:include\s*\(\s*(\S+)\s*\)|find_package\s*\(\s*(\S+))")),
]

PARSEABLE_EXTENSIONS = {
    ".c", ".h", ".cpp", ".hpp", ".cc",
    ".py",
    ".go",
    ".rs",
    ".ts", ".tsx", ".js", ".jsx",
    ".pl", ".pm",
    ".sh", ".bash",
    ".cmake",
}

# Map file extensions (and special filenames) to semantic node types.
# These types flow through the entire pipeline: Neo4j -> API -> WASM engine -> theme.
_EXT_TO_TYPE: dict[str, str] = {
    # Source code
    ".c": "source", ".h": "source", ".cpp": "source", ".hpp": "source", ".cc": "source",
    ".py": "source", ".go": "source", ".rs": "source",
    ".ts": "source", ".tsx": "source", ".js": "source", ".jsx": "source",
    ".pl": "source", ".pm": "source",
    ".java": "source", ".kt": "source", ".swift": "source", ".cs": "source",
    ".rb": "source", ".php": "source", ".lua": "source", ".zig": "source",
    ".m4": "source",
    # Config / build
    ".cmake": "config", ".toml": "config", ".yaml": "config", ".yml": "config",
    ".json": "config", ".xml": "config", ".ini": "config", ".cfg": "config",
    ".conf": "config", ".env": "config", ".properties": "config",
    # Scripts / automation
    ".sh": "script", ".bash": "script", ".zsh": "script", ".bat": "script",
    ".ps1": "script", ".fish": "script",
    # Documentation
    ".md": "doc", ".rst": "doc", ".txt": "doc", ".adoc": "doc",
    ".html": "doc", ".htm": "doc",
    # Data / assets
    ".csv": "data", ".tsv": "data", ".sql": "data",
    ".png": "asset", ".jpg": "asset", ".jpeg": "asset", ".gif": "asset",
    ".svg": "asset", ".ico": "asset", ".woff": "asset", ".woff2": "asset",
}

_NAME_TO_TYPE: dict[str, str] = {
    "Makefile": "config", "Dockerfile": "config", "Vagrantfile": "config",
    "CMakeLists.txt": "config", "Rakefile": "config", "Gemfile": "config",
    ".gitignore": "config", ".gitattributes": "config", ".editorconfig": "config",
    "LICENSE": "doc", "COPYING": "doc", "README": "doc", "CHANGELOG": "doc",
}


def classify_file_type(path: str) -> str:
    """Classify a file path into a semantic node type for the knowledge graph."""
    name = path.rsplit("/", 1)[-1]
    # Check exact filename matches first (Makefile, Dockerfile, etc.)
    if name in _NAME_TO_TYPE:
        return _NAME_TO_TYPE[name]
    # Check base name without extension for files like README.md -> already caught by ext
    base = name.split(".")[0]
    if base in _NAME_TO_TYPE:
        return _NAME_TO_TYPE[base]
    # Check extension
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
    return _EXT_TO_TYPE.get(ext, "service")


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


# ---------- Tree / node helpers ----------

def parse_repo_tree(tree: list[dict], source: str = "github") -> list[NodeAffected]:
    nodes = []
    for item in tree:
        if item["type"] != "blob":
            continue
        path = item["path"]
        node_type = classify_file_type(path)
        nodes.append(
            NodeAffected(
                id=path, name=path.rsplit("/", 1)[-1], type=node_type,
                action="add", domain=path.split("/")[0] if "/" in path else "",
                meta={"source": source, "path": path},
            )
        )
    return nodes


# ---------- Import parsing ----------

def _resolve_import(file_id: str, raw_import: str, known_files: set[str]) -> str | None:
    if raw_import in known_files:
        return raw_import
    dir_prefix = file_id.rsplit("/", 1)[0] + "/" if "/" in file_id else ""
    dotted = raw_import.replace(".", "/")
    candidates = [
        raw_import, f"{dir_prefix}{raw_import}",
        f"{dotted}.py", f"{dotted}/__init__.py",
        f"{dir_prefix}{raw_import}.ts", f"{dir_prefix}{raw_import}.tsx",
        f"{dir_prefix}{raw_import}.js", f"{dir_prefix}{raw_import}.jsx",
        f"{dir_prefix}{raw_import}/index.ts", f"{dir_prefix}{raw_import}/index.tsx",
        f"{dir_prefix}{raw_import}/index.js",
        raw_import.rsplit("/", 1)[-1] + ".go" if "/" in raw_import else f"{raw_import}.go",
        raw_import.replace("::", "/") + ".rs", raw_import.replace("::", "/") + "/mod.rs",
    ]
    for candidate in candidates:
        clean = candidate.lstrip("./")
        if clean in known_files:
            return clean
    return None


def parse_imports(file_id: str, content: str, known_files: set[str]) -> list[EdgeAffected]:
    ext = "." + file_id.rsplit(".", 1)[-1] if "." in file_id else ""
    edges: list[EdgeAffected] = []
    seen: set[str] = set()
    for extensions_str, pattern in IMPORT_PATTERNS:
        if ext not in extensions_str.split():
            continue
        for match in pattern.finditer(content):
            raw = next((g for g in match.groups() if g is not None), None)
            if not raw:
                continue
            target = _resolve_import(file_id, raw, known_files)
            if target and target != file_id and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(source_id=file_id, target_id=target, type="depends", action="add"))
    return edges


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
    """Walk a cloned repo and return entries compatible with parse_repo_tree."""
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

    meta = {
        "phase": "cloning", "repo": repo_label,
        "files_total": 0, "files_parseable": 0,
        "files_parsed": 0, "edges_found": 0,
        "nodes_by_type": {},
    }
    if on_progress:
        await on_progress(0, 0, meta)

    # ── 1. Clone ──
    tmpdir = await _clone_repo(owner, repo, token)
    logger.info("clone_complete", owner=owner, repo=repo, path=tmpdir)

    try:
        # ── 2. Discover files ──
        meta["phase"] = "discovering"
        if on_progress:
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
        if on_progress:
            await on_progress(0, len(parseable), meta)
        logger.info("discovery_complete", files=len(nodes), parseable=len(parseable))

        # ── 3. Parse imports from local files ──
        meta["phase"] = "parsing"
        all_edges: list[EdgeAffected] = []

        for i, file_id in enumerate(parseable):
            filepath = os.path.join(tmpdir, file_id)
            try:
                with open(filepath, "r", errors="replace") as f:
                    content = f.read()
                edges = parse_imports(file_id, content, known_files)
                all_edges.extend(edges)
            except Exception:
                pass

            done = i + 1
            meta["files_parsed"] = done
            meta["edges_found"] = len(all_edges)
            # report every 50 files or on the last file
            if on_progress and (done % 50 == 0 or done == len(parseable)):
                await on_progress(done, len(parseable), meta)

        logger.info("parsing_complete", parsed=len(parseable), edges=len(all_edges))

        # ── 4. Build event ──
        meta["phase"] = "publishing"
        if on_progress:
            await on_progress(len(parseable), len(parseable), meta)

        event = GraphEvent(
            source="github", event_type="sync",
            nodes_affected=nodes, edges_affected=all_edges,
        )
        logger.info("sync_complete", owner=owner, repo=repo,
                     nodes=len(nodes), edges=len(all_edges))
        return event

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ---------- SourceConnector wrapper ----------

from src.connectors.base import SourceConnector, MaterializedTree


class GitHubConnector:
    """SourceConnector implementation for github_repo source type."""

    async def materialize(self, source: dict, scratch_dir: str) -> MaterializedTree:
        owner = source["owner"]
        repo = source["name"]
        from src.config import settings
        tmpdir = await _clone_repo(owner, repo, settings.github_token)
        tree = _walk_local_tree(tmpdir)
        file_paths = [n.id for n in parse_repo_tree(tree)]
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
        except Exception:
            pass
        return MaterializedTree(root_dir=tmpdir, file_paths=file_paths, ref=ref)


CONNECTORS: dict[str, SourceConnector] = {"github_repo": GitHubConnector()}
