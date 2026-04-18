"""Reconstruct a file from content_chunks.

Chunks are line-bounded per the chunker (see
`services/ingestion/src/chunker.py`): each row carries
`chunk_index`, `content`, `start_line`, `end_line`. The chunker emits a
~64-token overlap between consecutive chunks, which is encoded as N
overlapping LINES between chunk N-1 and chunk N.

Dedup rule: when concatenating chunk N onto the running buffer, drop the
prefix of chunk N whose line numbers overlap chunk N-1's `end_line`.
Deterministic and cheap — no string matching required.

Response size is capped at `DEFAULT_CAP_BYTES` (5 MB); when the cap is
reached the result is returned with `truncated=True`.
"""
from __future__ import annotations

DEFAULT_CAP_BYTES = 5 * 1024 * 1024   # 5 MB


def reconstruct_chunks(chunks: list[dict], cap_bytes: int = DEFAULT_CAP_BYTES) -> dict:
    """Concatenate chunk contents in `chunk_index` order with line-overlap dedup.

    Parameters
    ----------
    chunks : list of dicts with keys ``chunk_index``, ``content``,
        ``start_line``, ``end_line``. Input is re-sorted defensively; the
        caller does not need to pre-sort.
    cap_bytes : maximum UTF-8 byte size of the reconstructed ``content``.
        When exceeded, concatenation stops and ``truncated`` is ``True``.

    Returns
    -------
    dict with keys ``content`` (str), ``chunk_count`` (int, number of
    chunks consumed before truncation/completion), and ``truncated``
    (bool).
    """
    sorted_chunks = sorted(chunks, key=lambda c: c["chunk_index"])
    buf_lines: list[str] = []
    last_end = 0       # highest line number already present in buf_lines
    byte_total = 0
    truncated = False
    used = 0

    for ch in sorted_chunks:
        chunk_lines = ch["content"].split("\n")
        start = ch["start_line"]
        # If chunk N starts at or before last_end, drop the overlap prefix.
        drop = max(0, last_end - start + 1)
        keep = chunk_lines[drop:]
        for line in keep:
            enc = (line + "\n").encode("utf-8")
            if byte_total + len(enc) > cap_bytes:
                truncated = True
                break
            buf_lines.append(line)
            byte_total += len(enc)
        used += 1
        last_end = ch["end_line"]
        if truncated:
            break

    content = "\n".join(buf_lines)
    return {"content": content, "chunk_count": used, "truncated": truncated}
