import re
import httpx
import structlog
from src.schema import GraphEvent, NodeAffected, EdgeAffected

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"

# ── Import patterns per language ──
IMPORT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # C/C++: #include "file.h"
    (".c .h .cpp .hpp .cc", re.compile(r'#include\s+"([^"]+)"')),
    # Python: import foo / from foo import bar
    (".py", re.compile(r"(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))")),
    # JS/TS: import ... from "./path" / require("./path")
    (".js .jsx .ts .tsx", re.compile(r"""(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))""")),
    # Go: import "path"
    (".go", re.compile(r'import\s+"([^"]+)"')),
    # Rust: use crate::path / mod path
    (".rs", re.compile(r"(?:use\s+(?:crate::)?([\w:]+)|mod\s+(\w+))")),
]

# Map file extensions to a node type
EXT_TYPE_MAP: dict[str, str] = {
    ".md": "service", ".txt": "service", ".rst": "service",
    ".yml": "service", ".yaml": "service", ".toml": "service", ".json": "service",
    ".ini": "service", ".cfg": "service", ".conf": "service",
    ".sh": "service", ".bash": "service", ".zsh": "service",
    ".dockerfile": "service", ".mk": "service",
}


def _classify_file(path: str) -> str:
    """Classify file type based on extension."""
    lower = path.lower()
    if lower.endswith("dockerfile") or lower.endswith("makefile"):
        return "service"
    ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
    return EXT_TYPE_MAP.get(ext, "service")


def parse_repo_tree(tree: list[dict], source: str = "github") -> list[NodeAffected]:
    """Parse a GitHub tree API response into graph nodes — ALL files, no extension filter."""
    nodes = []
    for item in tree:
        if item["type"] != "blob":
            continue
        path = item["path"]
        nodes.append(
            NodeAffected(
                id=path,
                name=path.rsplit("/", 1)[-1],
                type=_classify_file(path),
                action="add",
                domain=path.split("/")[0] if "/" in path else "",
                meta={"source": source, "path": path},
            )
        )
    return nodes


def _resolve_import(file_id: str, raw_import: str, known_files: set[str]) -> str | None:
    """Try to resolve an import string to a known file path."""
    # Direct match
    if raw_import in known_files:
        return raw_import

    # Relative to file's directory
    dir_prefix = file_id.rsplit("/", 1)[0] + "/" if "/" in file_id else ""

    # Python: foo.bar.baz → foo/bar/baz.py or foo/bar/baz/__init__.py
    dotted = raw_import.replace(".", "/")
    candidates = [
        raw_import,
        f"{dir_prefix}{raw_import}",
        f"{dotted}.py",
        f"{dotted}/__init__.py",
        # JS/TS relative imports
        f"{dir_prefix}{raw_import}.ts",
        f"{dir_prefix}{raw_import}.tsx",
        f"{dir_prefix}{raw_import}.js",
        f"{dir_prefix}{raw_import}.jsx",
        f"{dir_prefix}{raw_import}/index.ts",
        f"{dir_prefix}{raw_import}/index.tsx",
        f"{dir_prefix}{raw_import}/index.js",
        # Go packages (last segment)
        raw_import.rsplit("/", 1)[-1] + ".go" if "/" in raw_import else f"{raw_import}.go",
        # Rust: foo::bar → foo/bar.rs or foo/bar/mod.rs
        raw_import.replace("::", "/") + ".rs",
        raw_import.replace("::", "/") + "/mod.rs",
    ]

    for candidate in candidates:
        # Strip leading ./ for relative imports
        clean = candidate.lstrip("./")
        if clean in known_files:
            return clean

    return None


def parse_imports(
    file_id: str, content: str, known_files: set[str]
) -> list[EdgeAffected]:
    """Extract import/dependency edges from source file content."""
    ext = "." + file_id.rsplit(".", 1)[-1] if "." in file_id else ""
    edges: list[EdgeAffected] = []
    seen_targets: set[str] = set()

    for extensions_str, pattern in IMPORT_PATTERNS:
        if ext not in extensions_str.split():
            continue
        for match in pattern.finditer(content):
            # Take first non-None group
            raw = next((g for g in match.groups() if g is not None), None)
            if not raw:
                continue
            target = _resolve_import(file_id, raw, known_files)
            if target and target != file_id and target not in seen_targets:
                seen_targets.add(target)
                edges.append(
                    EdgeAffected(
                        source_id=file_id,
                        target_id=target,
                        type="depends",
                        action="add",
                    )
                )
    return edges


# Extensions worth fetching content for (those with import patterns)
PARSEABLE_EXTENSIONS = {".c", ".h", ".cpp", ".hpp", ".cc", ".py", ".go", ".rs", ".ts", ".tsx", ".js", ".jsx"}


async def fetch_repo_tree(
    owner: str, repo: str, token: str, branch: str = "master"
) -> list[dict]:
    """Fetch the full repo tree from GitHub API."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=30.0)
        resp.raise_for_status()
        return resp.json().get("tree", [])


async def fetch_file_content(
    owner: str, repo: str, path: str, token: str, ref: str = "master"
) -> str:
    """Fetch raw file content from GitHub API."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}?ref={ref}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.raw+json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=30.0)
        resp.raise_for_status()
        return resp.text


async def sync_repo(owner: str, repo: str, token: str) -> GraphEvent:
    """Full sync: fetch tree, parse ALL nodes, extract edges from ALL parseable files."""
    logger.info("sync_started", owner=owner, repo=repo)

    tree = await fetch_repo_tree(owner, repo, token)
    nodes = parse_repo_tree(tree)
    known_files = {n.id for n in nodes}

    # Fetch content and parse imports for all parseable files (no cap)
    edges: list[EdgeAffected] = []
    parseable = [n.id for n in nodes if "." in n.id and "." + n.id.rsplit(".", 1)[-1] in PARSEABLE_EXTENSIONS]

    logger.info("parsing_imports", total_files=len(parseable))
    for i, path in enumerate(parseable):
        try:
            content = await fetch_file_content(owner, repo, path, token)
            file_edges = parse_imports(path, content, known_files)
            edges.extend(file_edges)
        except Exception as e:
            logger.warning("file_fetch_failed", path=path, error=str(e))
        if (i + 1) % 100 == 0:
            logger.info("import_parse_progress", done=i + 1, total=len(parseable))

    event = GraphEvent(
        source="github",
        event_type="sync",
        nodes_affected=nodes,
        edges_affected=edges,
    )
    logger.info(
        "sync_complete",
        owner=owner,
        repo=repo,
        nodes=len(nodes),
        edges=len(edges),
    )
    return event
