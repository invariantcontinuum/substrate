"""Ingestion first-write embedding-dim guard (A.3)."""
import pytest
from src.config import settings
from src.llm import EmbeddingDimError, assert_embedding_dim


def test_accepts_correct_length():
    dim = settings.embedding_dim
    assert_embedding_dim(
        sync_id="abc",
        embeddings=[[0.0] * dim, [0.1] * dim],
        expected=dim,
    )


def test_raises_on_wrong_length():
    dim = settings.embedding_dim
    with pytest.raises(EmbeddingDimError) as exc_info:
        assert_embedding_dim(
            sync_id="abc",
            embeddings=[[0.0] * dim, [0.0] * (dim + 1)],
            expected=dim,
        )
    assert exc_info.value.sync_id == "abc"
    assert exc_info.value.expected == dim
    assert exc_info.value.actual == dim + 1
