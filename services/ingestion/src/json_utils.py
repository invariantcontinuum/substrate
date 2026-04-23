"""Shared JSON/JSONB coercion helpers for the ingestion service.

asyncpg registers JSONB codecs that return Python dicts by default, but
fallback paths (misconfigured codecs, test fixtures, raw string params)
still need safe coercion. Centralising here keeps every consumer DRY.
"""
from __future__ import annotations

import json


def json_object(value: object) -> dict:
    """Coerce a value that may be dict, JSON string, or something else into a dict."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def coerce_jsonb(value: object) -> dict | list:
    """Coerce a JSONB value (dict, list, or JSON string) into a Python object.

    Returns an empty dict for unparseable values.
    """
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, (dict, list)):
                return parsed
        except json.JSONDecodeError:
            pass
    return {}


def json_dict(value: object) -> dict:
    """Coerce a JSONB value into a dict. Lists and unparseable values become {}."""
    result = coerce_jsonb(value)
    return result if isinstance(result, dict) else {}
