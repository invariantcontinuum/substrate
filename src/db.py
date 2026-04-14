import asyncpg
import structlog
from src.config import settings

logger = structlog.get_logger()

_pool: asyncpg.Pool | None = None


def _parse_url(url: str) -> str:
    """Convert asyncpg URL format to plain postgresql://"""
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # During a sync the worker loop can easily hold most connections
        # writing job progress / repository rows. A 10-connection pool
        # was saturating and the /jobs + /jobs/schedules polling
        # endpoints would queue for >30s, tripping the gateway's read
        # timeout. Bump the cap so lightweight API reads stay
        # responsive alongside heavy background writes.
        _pool = await asyncpg.create_pool(
            _parse_url(settings.database_url),
            min_size=4,
            max_size=25,
        )
        logger.info("db_pool_created")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("db_pool_closed")
