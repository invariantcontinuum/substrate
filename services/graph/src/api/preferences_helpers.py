"""Temporary stub for per-user Leiden defaults. Task 16 replaces this with
a read against user_preferences.leiden_defaults. Kept as a dedicated module
so the communities API can depend on a single import path throughout the
transition."""
from typing import Any


_DEFAULTS: dict[str, Any] = {
    "resolution": 1.0,
    "beta": 0.01,
    "iterations": 10,
    "min_cluster_size": 4,
    "seed": 42,
}


def load_user_leiden_defaults(user_sub: str) -> dict[str, Any]:
    """Return the Leiden config a user has pinned as their default.
    Task 16 extends this to read user_preferences.leiden_defaults with a
    fallback to these values."""
    return dict(_DEFAULTS)
