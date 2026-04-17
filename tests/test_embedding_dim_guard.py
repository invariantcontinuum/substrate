"""Ingestion first-write embedding-dim guard (A.3)."""
import pytest
from src.llm import EmbeddingDimError, assert_embedding_dim


def test_accepts_correct_length():
    assert_embedding_dim(
        sync_id="abc",
        embeddings=[[0.0] * 1024, [0.1] * 1024],
        expected=1024,
    )


def test_raises_on_wrong_length():
    with pytest.raises(EmbeddingDimError) as exc_info:
        assert_embedding_dim(
            sync_id="abc",
            embeddings=[[0.0] * 1024, [0.0] * 768],
            expected=1024,
        )
    assert exc_info.value.sync_id == "abc"
    assert exc_info.value.expected == 1024
    assert exc_info.value.actual == 768
