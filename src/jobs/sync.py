import structlog
from src.config import settings
from src.connectors.github import sync_repo
from src.schema import parse_repo_url
from src.db import get_pool
from src.publisher import publish

logger = structlog.get_logger()


async def handle_sync(scope: dict, on_progress) -> None:
    owner = scope.get("owner", "")
    repo = scope.get("repo", "")
    repo_url = scope.get("repo_url", "")

    if repo_url and not (owner and repo):
        owner, repo = parse_repo_url(repo_url)

    if not owner or not repo:
        raise ValueError("scope must include owner+repo or repo_url")

    event = await sync_repo(owner, repo, settings.github_token, on_progress=on_progress)

    pool = await get_pool()
    await pool.execute(
        "INSERT INTO raw_events (source, event_type, payload) VALUES ($1, $2, $3)",
        "github", "sync", event.model_dump_json(),
    )
    await publish(event)
    logger.info("sync_job_complete", owner=owner, repo=repo, nodes=len(event.nodes_affected), edges=len(event.edges_affected))
