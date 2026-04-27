"""Tests for reconstruct_chunks: cap-exceeded raises FileTooLargeForReconstruct,
normal reconstruction returns full content."""
from __future__ import annotations

import pytest
from uuid import uuid4
from src.graph.file_reconstruct import (
    reconstruct_chunks,
    FileTooLargeForReconstruct,
)


def test_reconstruct_raises_when_cap_exceeded():
    file_id = uuid4()
    rows = [
        {"chunk_index": 0, "content": "x" * 1024, "start_line": 1, "end_line": 1},
        {"chunk_index": 1, "content": "y" * 1024, "start_line": 2, "end_line": 2},
    ]
    with pytest.raises(FileTooLargeForReconstruct) as exc_info:
        reconstruct_chunks(rows, cap_bytes=512, total_lines=2, file_id=file_id)
    err = exc_info.value
    assert err.file_id == file_id
    assert err.cap_bytes == 512
    assert err.covered_lines < err.total_lines


def test_reconstruct_returns_full_when_under_cap():
    file_id = uuid4()
    rows = [
        {"chunk_index": 0, "content": "alpha", "start_line": 1, "end_line": 1},
        {"chunk_index": 1, "content": "beta",  "start_line": 2, "end_line": 2},
    ]
    out = reconstruct_chunks(rows, cap_bytes=10_000, total_lines=2, file_id=file_id)
    assert "alpha" in out["content"] and "beta" in out["content"]
    assert out["chunk_count"] == 2
