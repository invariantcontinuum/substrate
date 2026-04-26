"""Verify config_registry maps section -> owning service + schema."""
from __future__ import annotations

import pytest

from src.config_registry import REGISTRY, lookup_section


def test_known_sections() -> None:
    for section in (
        "graph",
        "chat",
        "llm_dense",
        "llm_sparse",
        "llm_embedding",
        "llm_reranker",
        "postgres",
        "auth",
        "github",
    ):
        owner, schema = lookup_section(section)
        assert owner in {"graph", "ingestion", "gateway"}
        assert schema is not None


def test_unknown_section_raises() -> None:
    with pytest.raises(KeyError):
        lookup_section("nope")


def test_registry_has_no_extra_unknown_owners() -> None:
    # Sanity check that the registry never quietly grows an owner the
    # gateway can't resolve to an internal URL.
    for owner, _schema in REGISTRY.values():
        assert owner in {"graph", "ingestion", "gateway"}
