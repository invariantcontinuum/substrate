import asyncio
import hashlib
import structlog
from src.config import settings
from src.connectors.github import get_client as get_github_client
from src.llm import classify_file, embed, describe_edge
from src.qdrant import upsert_nodes_batch, ensure_collection

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"
LLM_SEMAPHORE = asyncio.Semaphore(5)
EMBED_SEMAPHORE = asyncio.Semaphore(20)


async def _fetch_content(owner: str, repo: str, path: str) -> str | None:
    client = await get_github_client()
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    headers = {"Authorization": f"Bearer {settings.github_token}", "Accept": "application/vnd.github.raw+json"}
    try:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text
    except Exception:
        return None


async def _enrich_node(owner: str, repo: str, node_id: str, node_name: str, node_domain: str) -> dict | None:
    content = await _fetch_content(owner, repo, node_id)
    if not content:
        return None

    async with LLM_SEMAPHORE:
        meta = await classify_file(node_id, content)

    embed_text = f"{node_id} — {meta.description} — {meta.category} — {meta.language}"
    async with EMBED_SEMAPHORE:
        vector = await embed(embed_text)

    point_id = hashlib.md5(node_id.encode()).hexdigest()
    return {
        "id": point_id,
        "vector": vector,
        "payload": {
            "node_id": node_id,
            "name": node_name,
            "domain": node_domain,
            "description": meta.description,
            "category": meta.category,
            "language": meta.language,
            "exports": meta.exports,
            "repo": f"{owner}/{repo}",
        },
        "meta": meta,
    }


async def handle_enrich(scope: dict, on_progress) -> None:
    owner = scope.get("owner", "")
    repo = scope.get("repo", "")
    limit = scope.get("limit", 0)
    unenriched_only = scope.get("unenriched_only", True)
    node_ids = scope.get("node_ids", [])

    if not owner or not repo:
        from src.schema import parse_repo_url
        repo_url = scope.get("repo_url", "")
        if repo_url:
            owner, repo = parse_repo_url(repo_url)
    if not owner or not repo:
        raise ValueError("scope must include owner+repo or repo_url")

    await ensure_collection()

    from src.connectors.github import fetch_repo_tree, parse_repo_tree
    tree = await fetch_repo_tree(owner, repo, settings.github_token)
    nodes = parse_repo_tree(tree)

    if node_ids:
        nodes = [n for n in nodes if n.id in set(node_ids)]
    if limit and limit > 0:
        nodes = nodes[:limit]

    total = len(nodes)
    logger.info("enrichment_started", owner=owner, repo=repo, total=total)
    await on_progress(0, total)

    qdrant_points: list[dict] = []
    batch_size = 20

    for batch_start in range(0, total, batch_size):
        batch = nodes[batch_start:batch_start + batch_size]
        tasks = [_enrich_node(owner, repo, n.id, n.name, n.domain) for n in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, dict) and result is not None:
                qdrant_points.append({
                    "id": result["id"],
                    "vector": result["vector"],
                    "payload": result["payload"],
                })

        done = min(batch_start + batch_size, total)
        await on_progress(done, total)
        logger.info("enrichment_progress", done=done, total=total)

    if qdrant_points:
        await upsert_nodes_batch(qdrant_points)

    logger.info("enrichment_complete", owner=owner, repo=repo, enriched=len(qdrant_points), total=total)
