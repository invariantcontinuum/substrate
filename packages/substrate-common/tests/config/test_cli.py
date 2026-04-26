"""Verify --override key=value parser produces a flat dict."""
from __future__ import annotations

import pytest

from substrate_common.config.cli import parse_overrides


def test_no_overrides():
    assert parse_overrides([]) == {}


def test_single_int():
    assert parse_overrides(["--override", "chat_top_k=15"]) == {"chat_top_k": 15}


def test_multiple():
    out = parse_overrides([
        "--override", "chat_top_k=15",
        "--override", "summary_instruction=Hello world",
    ])
    assert out == {"chat_top_k": 15, "summary_instruction": "Hello world"}


def test_float():
    assert parse_overrides(["--override", "leiden_resolution=1.25"]) == {"leiden_resolution": 1.25}


def test_bool():
    assert parse_overrides(["--override", "use_sparse=true"]) == {"use_sparse": True}
    assert parse_overrides(["--override", "use_sparse=false"]) == {"use_sparse": False}


def test_invalid_format():
    with pytest.raises(ValueError):
        parse_overrides(["--override", "no_equals_sign"])
