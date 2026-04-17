import time
import httpx
import structlog
from src.config import settings

logger = structlog.get_logger()


class EmbeddingDimError(Exception):
    """Raised when an embedding vector has a dimension that does not match
    the configured embedding_dim. Carries sync_id + expected/actual so
    the sync run can fail cleanly with the mismatch surfaced in logs."""

    def __init__(self, sync_id: str, expected: int, actual: int) -> None:
        self.sync_id = sync_id
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"Embedding dim mismatch in sync {sync_id}: expected {expected}, got {actual}"
        )


def assert_embedding_dim(sync_id: str, embeddings: list[list[float]], expected: int) -> None:
    """Raise EmbeddingDimError on the first vector whose length != expected."""
    for emb in embeddings:
        if len(emb) != expected:
            raise EmbeddingDimError(sync_id=sync_id, expected=expected, actual=len(emb))


_client: httpx.AsyncClient | None = None

# nomic-embed-text-v2-moe runs with n_ctx=512 tokens on the current
# lazy-lamacpp deployment. ~4 chars/token → keep each input comfortably
# under the ctx window to avoid 400 Bad Request from llamacpp's
# /v1/embeddings endpoint.
_MAX_INPUT_CHARS = 1600


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


# nomic-embed-text-v2 requires a task prefix on every input:
#   - `search_document: …` for corpus content (this service)
#   - `search_query: …`    for user queries (graph-service search)
# Without the prefix, embeddings are of lower quality and will not
# cluster with query embeddings produced elsewhere.
_DOCUMENT_PREFIX = "search_document: "


def _truncate(text: str) -> str:
    body_cap = _MAX_INPUT_CHARS - len(_DOCUMENT_PREFIX)
    if len(text) <= body_cap:
        return _DOCUMENT_PREFIX + text
    return _DOCUMENT_PREFIX + text[:body_cap]


def _auth_headers() -> dict[str, str]:
    if settings.llm_api_key:
        return {"Authorization": f"Bearer {settings.llm_api_key}"}
    return {}


async def embed(text: str) -> list[float]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        headers=_auth_headers(),
        json={"input": _truncate(text), "model": settings.embedding_model},
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


async def _embed_call(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    resp = await client.post(
        settings.embedding_url,
        headers=_auth_headers(),
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
