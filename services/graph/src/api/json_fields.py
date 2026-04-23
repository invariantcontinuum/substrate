from __future__ import annotations

import json
from typing import Any


def normalize_json_value(value: Any) -> Any:
    """Coerce legacy/double-encoded JSONB reads back into structured data."""
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def normalize_row_json_fields(row: Any, *field_names: str) -> dict[str, Any]:
    data = dict(row)
    for field_name in field_names:
        if field_name in data:
            data[field_name] = normalize_json_value(data[field_name])
    return data
