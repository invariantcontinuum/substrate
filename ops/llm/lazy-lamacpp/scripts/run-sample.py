#!/usr/bin/env python3
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def format_seconds(value: float) -> str:
    return f"{value:.3f} s"


def format_float(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}"


def unwrap_fenced_block(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped

    lines = stripped.splitlines()
    if len(lines) == 1:
        return stripped

    body = lines[1:]
    if body and body[-1].strip() == "```":
        body = body[:-1]
    return "\n".join(body).strip()


def format_response_text(text: str) -> str:
    unwrapped = unwrap_fenced_block(text)
    try:
        parsed = json.loads(unwrapped)
    except json.JSONDecodeError:
        return unwrapped

    return json.dumps(parsed, indent=2)


def print_header(model: str, sample: str, endpoint: str, url: str, description: str) -> None:
    print("Sample Run")
    print(f"model: {model}")
    print(f"sample: {sample}")
    print(f"endpoint: {endpoint}")
    print(f"url: {url}")
    if description:
        print(f"description: {description}")
    print()


def print_metrics(metrics: list[tuple[str, str]]) -> None:
    print("Metrics")
    width = max(len(label) for label, _ in metrics)
    for label, value in metrics:
        print(f"{label:<{width}}  {value}")
    print()


def summarize_generation(body: dict, payload: dict, meta: dict) -> None:
    usage = body.get("usage", {})
    timings = body.get("timings", {})
    message = (((body.get("choices") or [{}])[0]).get("message") or {})
    text = message.get("content")
    if text is None:
        text = ((body.get("choices") or [{}])[0]).get("text", "")
    reasoning = message.get("reasoning_content", "")

    metrics = [
        ("HTTP status", str(meta["status"])),
        ("Total latency", format_seconds(meta["latency_s"])),
        ("Time to first byte", format_seconds(meta["ttfb_s"])),
        ("Prompt tokens", str(usage.get("prompt_tokens", 0))),
        ("Completion tokens", str(usage.get("completion_tokens", 0))),
        ("Total tokens", str(usage.get("total_tokens", 0))),
        ("Output speed", f'{format_float(float(timings.get("predicted_per_second", 0.0)), 2)} tok/s'),
    ]
    print_metrics(metrics)

    print("Response")
    if reasoning:
        print("reasoning:")
        print(reasoning.strip())
        print()
    print("content:")
    print(format_response_text(text) if isinstance(text, str) else json.dumps(text, indent=2))
    print()


def summarize_embeddings(body: dict, payload: dict, meta: dict) -> None:
    data = body.get("data", [])
    usage = body.get("usage", {})
    first_vector = data[0].get("embedding", []) if data else []
    preview = [round(float(x), 6) for x in first_vector[:8]]

    metrics = [
        ("HTTP status", str(meta["status"])),
        ("Total latency", format_seconds(meta["latency_s"])),
        ("Time to first byte", format_seconds(meta["ttfb_s"])),
        ("Input items", str(len(payload.get("input", [])) if isinstance(payload.get("input"), list) else 1)),
        ("Embeddings returned", str(len(data))),
        ("Vector dimensions", str(len(first_vector))),
        ("Prompt tokens", str(usage.get("prompt_tokens", 0))),
    ]
    print_metrics(metrics)

    print("Preview")
    print(f"embedding[0][:8] = {preview}")
    print()


def summarize_rerank(body: dict, payload: dict, meta: dict) -> None:
    usage = body.get("usage", {})
    results = body.get("results", body if isinstance(body, list) else [])
    top = results[0] if results else {}
    score = top.get("relevance_score", top.get("score", 0.0))

    metrics = [
        ("HTTP status", str(meta["status"])),
        ("Total latency", format_seconds(meta["latency_s"])),
        ("Time to first byte", format_seconds(meta["ttfb_s"])),
        ("Documents submitted", str(len(payload.get("documents", [])))),
        ("Results returned", str(len(results))),
        ("Prompt tokens", str(usage.get("prompt_tokens", 0))),
        ("Best score", format_float(float(score), 6)),
    ]
    print_metrics(metrics)

    print("Ranked Results")
    for idx, item in enumerate(results, start=1):
        score = item.get("relevance_score", item.get("score", 0.0))
        doc_index = item.get("index", -1)
        text = ""
        documents = payload.get("documents", [])
        if isinstance(documents, list) and 0 <= doc_index < len(documents):
            text = documents[doc_index]
        print(f"{idx}. idx={doc_index} score={format_float(float(score), 6)}")
        if text:
            print(f"   {text}")
    print()


def build_payload(sample_json: dict, model_name: str) -> tuple[str, dict]:
    endpoint = sample_json["endpoint"]
    body = sample_json["body"]
    if "model" not in body:
        body = dict(body)
        body["model"] = model_name
    return endpoint, body


def perform_request(url: str, body: dict) -> tuple[dict, dict]:
    payload_bytes = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer no-key",
        },
        method="POST",
    )

    start = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            ttfb = time.perf_counter() - start
            raw = response.read()
            latency = time.perf_counter() - start
            status = response.status
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {body_text}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"request failed: {exc.reason}") from exc

    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"response was not valid JSON: {raw[:400]!r}") from exc

    meta = {
        "status": status,
        "latency_s": latency,
        "ttfb_s": ttfb,
        "request_bytes": len(payload_bytes),
        "response_bytes": len(raw),
    }
    return data, meta


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-key", required=True)
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--sample-name", required=True)
    parser.add_argument("--sample-file", required=True)
    args = parser.parse_args()

    sample_json = json.loads(Path(args.sample_file).read_text())
    endpoint, body = build_payload(sample_json, args.model_name)
    url = urllib.parse.urljoin(args.url + "/", endpoint.lstrip("/"))

    response, meta = perform_request(url, body)
    print_header(
        model=args.model_key,
        sample=args.sample_name,
        endpoint=endpoint,
        url=url,
        description=sample_json.get("description", ""),
    )

    if endpoint.endswith("/v1/embeddings") or endpoint.endswith("/embeddings"):
        summarize_embeddings(response, body, meta)
    elif endpoint.endswith("/v1/rerank") or endpoint.endswith("/v1/reranking") or endpoint.endswith("/rerank") or endpoint.endswith("/reranking"):
        summarize_rerank(response, body, meta)
    else:
        summarize_generation(response, body, meta)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
