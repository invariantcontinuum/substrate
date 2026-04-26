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


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=settings.embedding_http_timeout_connect_s,
                read=settings.embedding_http_timeout_read_s,
                write=settings.embedding_http_timeout_write_s,
                pool=settings.embedding_http_timeout_pool_s,
            ),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


# Prefix scheme configured via settings.embedding_document_prefix.
# jina-code-embeddings uses "search_document: " for corpus content and
# "search_query: " for user queries so vectors cluster together. Other
# models may require a different prefix (or none) — override per-model
# via EMBEDDING_DOCUMENT_PREFIX in .env.<mode>.


def _truncate(text: str) -> str:
    prefix = settings.embedding_document_prefix
    body_cap = settings.embedding_max_input_chars - len(prefix)
    if len(text) <= body_cap:
        return prefix + text
    return prefix + text[:body_cap]


def _auth_headers() -> dict[str, str]:
    if settings.embedding_api_key:
        return {"Authorization": f"Bearer {settings.embedding_api_key}"}
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

    Truncates overlong inputs (common cause of 400 from llamacpp). Both
    400 (request-too-large) and 500 (llamacpp "input > batch size") are
    treated as recoverable: bisect the batch so a single poison-pill
    input doesn't lose embeddings for the whole batch. At size 1 with a
    persistent bad status we record ``None`` for that input and keep
    going.
    """
    client = await _get_client()
    start = time.monotonic()
    batch_size = len(texts)
    truncated = [_truncate(t) for t in texts]

    try:
        vectors = await _embed_call(client, truncated)
        elapsed = time.monotonic() - start
        logger.debug("embed_batch_complete", batch_size=batch_size,
                     duration_ms=round(elapsed * 1000))
        return list(vectors)
    except httpx.ConnectError as e:
        elapsed = time.monotonic() - start
        logger.error("embed_batch_connection_error", batch_size=batch_size,
                      error=str(e), duration_ms=round(elapsed * 1000))
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (400, 500):
            if batch_size == 1:
                # Last-ditch: the prefix + first half of the body may
                # still tokenise under 512. Retry once at 40 % length
                # before giving up on this chunk.
                prefix = settings.embedding_document_prefix
                body = truncated[0][len(prefix):]
                if len(body) > 320:
                    short = prefix + body[: int(len(body) * 0.4)]
                    try:
                        vectors = await _embed_call(client, [short])
                        logger.info(
                            "embed_item_shortened",
                            original_chars=len(truncated[0]),
                            shortened_chars=len(short),
                        )
                        return list(vectors)
                    except httpx.HTTPStatusError:
                        pass
                logger.warning(
                    "embed_item_rejected",
                    chars=len(truncated[0]),
                    status=e.response.status_code,
                    preview=truncated[0][:120],
                )
                return [None]
            mid = batch_size // 2
            logger.warning("embed_batch_bisect", batch_size=batch_size,
                           reason=f"http_{e.response.status_code}")
            left = await embed_batch(truncated[:mid])
            right = await embed_batch(truncated[mid:])
            return left + right
        elapsed = time.monotonic() - start
        logger.error("embed_batch_failed", batch_size=batch_size,
                      status=e.response.status_code,
                      error=str(e), duration_ms=round(elapsed * 1000))
        raise
    except Exception as e:  # noqa: BLE001 — log any embed failure then re-raise
        elapsed = time.monotonic() - start
        logger.error("embed_batch_failed", batch_size=batch_size,
                      error=str(e), duration_ms=round(elapsed * 1000))
        raise
