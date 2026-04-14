import time
import httpx
import structlog
from src.config import settings

logger = structlog.get_logger()

_client: httpx.AsyncClient | None = None

# Qwen3-Embedding-0.6B has n_ctx_train = 32768 tokens. Keep each input
# well under that — roughly 6000 characters ≈ 1500 tokens — and the whole
# batch well under the server's maximum accumulated input. Overlong
# inputs are the usual cause of 400 Bad Request from llamacpp's
# /v1/embeddings endpoint.
_MAX_INPUT_CHARS = 6000


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=10.0),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


def _truncate(text: str) -> str:
    if len(text) <= _MAX_INPUT_CHARS:
        return text
    return text[:_MAX_INPUT_CHARS]


async def embed(text: str) -> list[float]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        json={"input": _truncate(text), "model": settings.embedding_model},
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


async def _embed_call(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    resp = await client.post(
        settings.embedding_url,
        json={"input": texts, "model": settings.embedding_model},
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    return [item["embedding"] for item in sorted(data, key=lambda x: x["index"])]


async def embed_batch(texts: list[str]) -> list[list[float] | None]:
    """Embed a batch of texts, returning one vector per input (or None if
    that specific input was rejected by the model after retries).

    Truncates overlong inputs (common cause of 400 from llamacpp). On a
    400 response we recursively bisect the batch so a single poison-pill
    input doesn't lose embeddings for the whole batch. At size 1 with a
    persistent 400 we record `None` for that input and keep going.
    """
    client = await _get_client()
    start = time.monotonic()
    batch_size = len(texts)
    truncated = [_truncate(t) for t in texts]

    try:
        vectors = await _embed_call(client, truncated)
        elapsed = time.monotonic() - start
        logger.info("embed_batch_complete", batch_size=batch_size,
                     duration_ms=round(elapsed * 1000))
        return list(vectors)
    except httpx.ConnectError as e:
        elapsed = time.monotonic() - start
        logger.error("embed_batch_connection_error", batch_size=batch_size,
                      error=str(e), duration_ms=round(elapsed * 1000))
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            if batch_size == 1:
                logger.warning(
                    "embed_item_rejected",
                    chars=len(truncated[0]),
                    preview=truncated[0][:120],
                )
                return [None]
            mid = batch_size // 2
            logger.warning("embed_batch_bisect", batch_size=batch_size,
                           reason="http_400")
            left = await embed_batch(truncated[:mid])
            right = await embed_batch(truncated[mid:])
            return left + right
        elapsed = time.monotonic() - start
        logger.error("embed_batch_failed", batch_size=batch_size,
                      status=e.response.status_code,
                      error=str(e), duration_ms=round(elapsed * 1000))
        raise
    except Exception as e:
        elapsed = time.monotonic() - start
        logger.error("embed_batch_failed", batch_size=batch_size,
                      error=str(e), duration_ms=round(elapsed * 1000))
        raise
