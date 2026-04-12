import re
import asyncio
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
# These types flow through the entire pipeline: Neo4j → API → WASM engine → theme.
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
    # Check base name without extension for files like README.md → already caught by ext
    base = name.split(".")[0]
    if base in _NAME_TO_TYPE:
        return _NAME_TO_TYPE[base]
    # Check extension
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
    return _EXT_TO_TYPE.get(ext, "service")

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


async def fetch_repo_tree(owner: str, repo: str, token: str, branch: str = "master") -> list[dict]:
    client = await get_client()
    url = f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json().get("tree", [])


async def _fetch_and_parse(
    semaphore: asyncio.Semaphore, owner: str, repo: str, path: str,
    token: str, known_files: set[str], ref: str = "master",
) -> list[EdgeAffected]:
    async with semaphore:
        client = await get_client()
        url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}?ref={ref}"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.raw+json"}
        try:
            resp = await client.get(url, headers=headers)
            remaining = int(resp.headers.get("x-ratelimit-remaining", "999"))
            if remaining < 50:
                reset_at = int(resp.headers.get("x-ratelimit-reset", "0"))
                import time
                wait = max(0, reset_at - int(time.time())) + 1
                logger.warning("rate_limit_approaching", remaining=remaining, wait=wait)
                await asyncio.sleep(min(wait, 60))
            resp.raise_for_status()
            return parse_imports(path, resp.text, known_files)
        except Exception as e:
            logger.warning("file_fetch_failed", path=path, error=str(e))
            return []


async def sync_repo(
    owner: str, repo: str, token: str,
    on_progress=None,
) -> GraphEvent:
    logger.info("sync_started", owner=owner, repo=repo)

    tree = await fetch_repo_tree(owner, repo, token)
    nodes = parse_repo_tree(tree)
    known_files = {n.id for n in nodes}

    parseable = [n.id for n in nodes if "." in n.id and "." + n.id.rsplit(".", 1)[-1] in PARSEABLE_EXTENSIONS]
    logger.info("parsing_imports", total_files=len(parseable))

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    all_edges: list[EdgeAffected] = []

    batch_size = 100
    for batch_start in range(0, len(parseable), batch_size):
        batch = parseable[batch_start:batch_start + batch_size]
        results = await asyncio.gather(
            *[_fetch_and_parse(semaphore, owner, repo, p, token, known_files) for p in batch]
        )
        for edges in results:
            all_edges.extend(edges)

        done = min(batch_start + batch_size, len(parseable))
        logger.info("import_parse_progress", done=done, total=len(parseable))
        if on_progress:
            await on_progress(done, len(parseable))

    event = GraphEvent(
        source="github", event_type="sync",
        nodes_affected=nodes, edges_affected=all_edges,
    )
    logger.info("sync_complete", owner=owner, repo=repo, nodes=len(nodes), edges=len(all_edges))
    return event
