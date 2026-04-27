"""Reconstruct a file from content_chunks.

Chunks are line-bounded per the chunker (see
`packages/substrate-graph-builder/src/substrate_graph_builder/chunker/`):
each row carries `chunk_index`, `content`, `start_line`, `end_line`.
Two kinds of line discontinuity exist between consecutive chunks:

  * **Overlap** — the fallback line chunker emits a ~64-token overlap, so
    chunk N's `start_line` ≤ chunk N-1's `end_line`.
  * **Gap** — the AST chunker only emits named top-level constructs, so
    blank lines / file-level comments between constructs live in no
    chunk at all; chunk N's `start_line` > chunk N-1's `end_line + 1`.
    There can also be a trailing gap after the last chunk when the file
    ends with blank lines beyond the last construct.

Reconstruction is therefore **position-based**, not concatenation-based:
every chunk's lines are written at their 1-based `start_line` offset,
gaps are left as empty lines so downstream line numbers match the
original file, and `total_lines` pads the tail when known. This is what
keeps a 410-line source from rendering as 404 lines in the viewer.

Response size is capped at the ``cap_bytes`` argument (default 5 MiB via
``settings.file_reconstruct_max_bytes``); when the cap is reached
``FileTooLargeForReconstruct`` is raised with context about the file_id,
covered lines, total lines, and the cap.
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass
class FileTooLargeForReconstruct(Exception):
    file_id:       UUID
    covered_lines: int
    total_lines:   int
    cap_bytes:     int

    def __str__(self) -> str:
        return (
            f"file {self.file_id}: reconstruction stopped at "
            f"{self.covered_lines}/{self.total_lines} lines "
            f"(cap {self.cap_bytes} bytes)"
        )


def _chunk_lines(content: str) -> list[str]:
    """Split a chunk's text into lines without inventing a trailing blank.

    `str.split("\n")` on `"a\nb\n"` yields `["a", "b", ""]`. That last
    empty element is an artefact of the trailing newline, not a real
    line — including it would shift every subsequent chunk by one.
    """
    lines = content.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def reconstruct_chunks(
    chunks: list[dict],
    cap_bytes: int,
    total_lines: int | None = None,
    file_id: UUID | None = None,
) -> dict:
    """Reconstruct file text from `content_chunks` rows.

    Parameters
    ----------
    chunks : list of dicts with keys ``chunk_index``, ``content``,
        ``start_line``, ``end_line``. Input is re-sorted defensively; the
        caller does not need to pre-sort.
    cap_bytes : maximum UTF-8 byte size of the reconstructed ``content``.
        When exceeded, ``FileTooLargeForReconstruct`` is raised.
    total_lines : original file line count, if known. When supplied and
        greater than the highest chunk line, the tail is padded with
        blank lines so the rendered viewer shows every original line.
    file_id : UUID identifying the file (used in the exception). If None,
        a zero UUID is substituted.

    Returns
    -------
    dict with keys ``content`` (str) and ``chunk_count`` (int, total chunks
    consumed).

    Raises
    ------
    FileTooLargeForReconstruct
        When the accumulated byte size exceeds ``cap_bytes`` before all
        lines have been emitted.
    """
    _file_id: UUID = file_id if file_id is not None else UUID(int=0)
    _total_lines: int = total_lines if total_lines is not None else 0

    if not chunks:
        return {
            "content": "" if not total_lines else "\n" * max(0, total_lines - 1),
            "chunk_count": 0,
        }

    sorted_chunks = sorted(chunks, key=lambda c: c["chunk_index"])

    # Lay each chunk down at its original 1-based start line. Overlap
    # regions get overwritten by the later chunk — its content is by
    # construction the same source bytes, so this is a harmless no-op
    # that also works if a chunker ever emitted slightly different
    # trimming on overlaps.
    lines_by_pos: dict[int, str] = {}
    max_pos = 0
    for ch in sorted_chunks:
        start = ch["start_line"]
        for i, line in enumerate(_chunk_lines(ch["content"])):
            pos = start + i
            lines_by_pos[pos] = line
            if pos > max_pos:
                max_pos = pos

    # When the original line_count is known, it is authoritative: pad the
    # tail if chunks stopped short (AST chunker misses trailing blanks
    # after the last top-level construct), clamp the head if individual
    # chunks over-produced (some chunker paths store content with one
    # line more than their declared start_line..end_line range — the
    # reconstructed length must still match file_embeddings.line_count).
    if total_lines is not None:
        max_pos = total_lines
        _total_lines = total_lines

    out_lines: list[str] = []
    byte_total = 0
    for pos in range(1, max_pos + 1):
        line = lines_by_pos.get(pos, "")
        enc = (line + "\n").encode("utf-8")
        if byte_total + len(enc) > cap_bytes:
            raise FileTooLargeForReconstruct(
                file_id=_file_id,
                covered_lines=len(out_lines),
                total_lines=_total_lines or max_pos,
                cap_bytes=cap_bytes,
            )
        out_lines.append(line)
        byte_total += len(enc)

    return {
        "content": "\n".join(out_lines),
        "chunk_count": len(sorted_chunks),
    }
