import re
import httpx
import structlog
from src.schema import GraphEvent, NodeAffected, EdgeAffected

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"
CODE_EXTENSIONS = {".c", ".h", ".py", ".go", ".rs", ".ts", ".tsx", ".js", ".jsx", ".java"}
INCLUDE_RE = re.compile(r'#include\s+"([^"]+)"')


def parse_repo_tree(tree: list[dict], source: str = "github") -> list[NodeAffected]:
    """Parse a GitHub tree API response into graph nodes."""
    nodes = []
    for item in tree:
        if item["type"] != "blob":
            continue
        path = item["path"]
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        if ext not in CODE_EXTENSIONS:
            continue
        nodes.append(
            NodeAffected(
                id=path,
                name=path.rsplit("/", 1)[-1],
                type="service",
                action="add",
                domain=path.split("/")[0] if "/" in path else "",
                meta={"source": source, "path": path},
            )
        )
    return nodes


def parse_c_includes(
    file_id: str, content: str, known_files: set[str]
) -> list[EdgeAffected]:
    """Extract #include edges from C/C++ source content."""
    edges = []
    for match in INCLUDE_RE.finditer(content):
        include_name = match.group(1)
        dir_prefix = file_id.rsplit("/", 1)[0] + "/" if "/" in file_id else ""
        candidates = [include_name, f"{dir_prefix}{include_name}"]
        for candidate in candidates:
            if candidate in known_files:
                edges.append(
                    EdgeAffected(
                        source_id=file_id,
                        target_id=candidate,
                        type="depends",
                        action="add",
                    )
                )
                break
    return edges


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
    """Full sync: fetch tree, parse nodes, extract edges from #includes."""
    logger.info("sync_started", owner=owner, repo=repo)

    tree = await fetch_repo_tree(owner, repo, token)
    nodes = parse_repo_tree(tree)
    known_files = {n.id for n in nodes}

    edges: list[EdgeAffected] = []
    c_files = [n.id for n in nodes if n.id.endswith((".c", ".h"))]

    for path in c_files[:50]:
        try:
            content = await fetch_file_content(owner, repo, path, token)
            file_edges = parse_c_includes(path, content, known_files)
            edges.extend(file_edges)
        except Exception as e:
            logger.warning("file_fetch_failed", path=path, error=str(e))

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
