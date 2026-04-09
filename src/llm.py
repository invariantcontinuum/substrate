import json
import httpx
import structlog
from src.config import settings
from src.schema import FileMetadata

logger = structlog.get_logger()

_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=10.0))
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def embed(text: str) -> list[float]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        json={"input": text, "model": settings.embedding_model},
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


async def embed_batch(texts: list[str]) -> list[list[float]]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        json={"input": texts, "model": settings.embedding_model},
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    return [item["embedding"] for item in sorted(data, key=lambda x: x["index"])]


async def classify_file(path: str, content: str) -> FileMetadata:
    client = await _get_client()
    prompt = f"""You are a code analyst. Classify this source file. Respond with JSON only, no explanation.

File: {path}
First 2000 characters:
```
{content[:2000]}
```

Respond exactly as: {{"description": "one-line summary of what this file does", "category": "source|test|config|docs|build|ci|script|data|header", "language": "detected language", "exports": ["up to 5 main symbols"]}}"""

    try:
        resp = await client.post(
            settings.llm_url,
            json={
                "model": settings.llm_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 256,
            },
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip()
        if "```" in text:
            text = text.split("```")[1].strip()
            if text.startswith("json"):
                text = text[4:].strip()
        return FileMetadata(**json.loads(text))
    except Exception as e:
        logger.warning("classify_failed", path=path, error=str(e))
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        lang_map = {".c": "c", ".h": "c", ".py": "python", ".go": "go", ".rs": "rust", ".ts": "typescript", ".js": "javascript", ".md": "markdown", ".yml": "yaml", ".yaml": "yaml", ".sh": "shell"}
        return FileMetadata(description=path.rsplit("/", 1)[-1], category="source", language=lang_map.get(ext, ""))


async def describe_edge(source_path: str, target_path: str) -> str:
    client = await _get_client()
    try:
        resp = await client.post(
            settings.llm_url,
            json={
                "model": settings.llm_model,
                "messages": [{"role": "user", "content": f"Describe this code dependency in under 8 words.\n{source_path} depends on {target_path}.\nRespond with just the description, no quotes."}],
                "temperature": 0.1,
                "max_tokens": 32,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()[:80]
    except Exception as e:
        logger.warning("describe_edge_failed", error=str(e))
        return ""
