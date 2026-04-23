"""Canonical-hash determinism: same inputs always produce same hash;
different inputs produce different hashes."""
from uuid import UUID

from src.graph.leiden_config import LeidenConfig


def test_hash_is_deterministic():
    cfg = LeidenConfig(resolution=1.0, beta=0.01, iterations=10,
                       min_cluster_size=4, seed=42)
    ids = [UUID("11111111-1111-1111-1111-111111111111"),
           UUID("22222222-2222-2222-2222-222222222222")]
    assert cfg.canonical_hash(ids) == cfg.canonical_hash(ids)


def test_hash_independent_of_id_order():
    cfg = LeidenConfig(resolution=1.0, beta=0.01, iterations=10,
                       min_cluster_size=4, seed=42)
    a = [UUID("11111111-1111-1111-1111-111111111111"),
         UUID("22222222-2222-2222-2222-222222222222")]
    b = list(reversed(a))
    assert cfg.canonical_hash(a) == cfg.canonical_hash(b)


def test_different_configs_produce_different_hashes():
    c1 = LeidenConfig(resolution=1.0, beta=0.01, iterations=10,
                      min_cluster_size=4, seed=42)
    c2 = LeidenConfig(resolution=1.5, beta=0.01, iterations=10,
                      min_cluster_size=4, seed=42)
    ids = [UUID("11111111-1111-1111-1111-111111111111")]
    assert c1.canonical_hash(ids) != c2.canonical_hash(ids)


def test_validates_ranges():
    import pytest
    with pytest.raises(ValueError):
        LeidenConfig(resolution=0.0, beta=0.01, iterations=10,
                     min_cluster_size=4, seed=42)
    with pytest.raises(ValueError):
        LeidenConfig(resolution=1.0, beta=1.0, iterations=10,
                     min_cluster_size=4, seed=42)
