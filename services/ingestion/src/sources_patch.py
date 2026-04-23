"""PATCH /api/sources/{id} — partial update of source label, enabled flag,
and config subtree with one-level-deep retention merge.

Business rules
--------------
- label  -> maps to sources.name; COALESCE so absent means no change
- enabled -> maps to sources.enabled; COALESCE so absent means no change
- config  -> shallow-merged over existing JSONB; retention subkey merged one
             level deep so callers can update individual retention keys without
             clobbering the rest of the config.
- age_days / per_source_cap must be > 0 (validated by Pydantic before reaching DB).
"""
from __future__ import annotations

import json
from typing import Annotated

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class RetentionOverridesPatch(BaseModel):
    age_days: Annotated[int, Field(gt=0)] | None = None
    per_source_cap: Annotated[int, Field(gt=0)] | None = None
    never_prune: bool | None = None


class SourceConfigPatch(BaseModel):
    model_config = ConfigDict(extra="allow")

    retention: RetentionOverridesPatch | None = None


class SourcePatch(BaseModel):
    label: str | None = None
    enabled: bool | None = None
    config: SourceConfigPatch | None = None


# ---------------------------------------------------------------------------
# Implementation — extracted so tests can call it without ASGI overhead
# ---------------------------------------------------------------------------

async def update_source_impl(pool, source_id: str, patch: SourcePatch, user_sub: str) -> dict:
    """Apply *patch* to the sources row identified by *source_id*.

    Returns a dict shaped as the HTTP response body.
    Raises HTTPException(404) when the row is not found.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """SELECT id, name, url, config, enabled
                   FROM sources
                   WHERE id=$1::uuid AND user_sub = $2
                   FOR UPDATE""",
                source_id, user_sub,
            )
            if row is None:
                raise HTTPException(404, f"source {source_id} not found")

            current_config = row["config"] or {}
            if isinstance(current_config, str):
                current_config = json.loads(current_config)

            new_config = dict(current_config)
            if patch.config is not None:
                incoming = patch.config.model_dump(exclude_none=True)
                for k, v in incoming.items():
                    if k == "retention" and isinstance(v, dict):
                        merged_retention = dict(new_config.get("retention", {}))
                        merged_retention.update(v)
                        new_config["retention"] = merged_retention
                    else:
                        new_config[k] = v

            await conn.execute(
                """
                UPDATE sources SET
                  name    = COALESCE($2, name),
                  enabled = COALESCE($3, enabled),
                  config  = $4::jsonb
                WHERE id = $1::uuid AND user_sub = $5
                """,
                source_id,
                patch.label,
                patch.enabled,
                new_config,
                user_sub,
            )
            updated = await conn.fetchrow(
                """SELECT id, name, url, config, enabled
                   FROM sources
                   WHERE id=$1::uuid AND user_sub = $2""",
                source_id, user_sub,
            )

    return {
        "id": str(updated["id"]),
        "name": updated["name"],
        "url": updated["url"],
        "enabled": updated["enabled"],
        "config": (
            updated["config"]
            if isinstance(updated["config"], dict)
            else json.loads(updated["config"] or "{}")
        ),
    }
