/**
 * Per-role LLM connection card. Reads + writes the matching
 * ``llm_<role>`` config section through the runtime-config hooks.
 *
 * Each card renders a generic field list (so the same component drives
 * the Dense/Sparse/Embedding/Reranker variants without custom layouts)
 * and exposes a `Test connection` button. The matching test endpoint
 * (``POST /api/llm/<role>/test``) is a Phase-6 follow-up; until it
 * lands the button surfaces the upstream error.
 */
import { useState } from "react";
import { useEffectiveConfig, useApplyConfig } from "@/hooks/useRuntimeConfig";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";

export type LLMConnectionRole =
  | "dense"
  | "sparse"
  | "embedding"
  | "reranker";

export interface LLMConnectionField {
  key: string;
  label: string;
  type?: "text" | "number" | "password";
  readonly?: boolean;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

interface TestResponse {
  ok?: boolean;
  latency_ms?: number;
  message?: string;
}

export function LLMConnectionCard({
  role,
  title,
  fields,
}: {
  role: LLMConnectionRole;
  title: string;
  fields: LLMConnectionField[];
}) {
  const section = `llm_${role}`;
  const { config } = useEffectiveConfig<Record<string, unknown>>(section);
  const apply = useApplyConfig(section);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  // Track which `config` snapshot the current draft was started from.
  // When the cache invalidates after a successful PUT (or an SSE
  // ``config.updated`` from another device), the snapshot serial
  // changes and we discard the now-stale draft inline — no useEffect.
  const configKey = JSON.stringify(config);
  const [draftBaseKey, setDraftBaseKey] = useState<string>(configKey);
  const effectiveDraft = draftBaseKey === configKey ? draft : {};

  const merged: Record<string, unknown> = { ...config, ...effectiveDraft };

  async function test() {
    const token = authToken();
    if (!token) return;
    try {
      const r = await apiFetch<TestResponse>(
        `/api/llm/${role}/test`,
        token,
        { method: "POST" },
      );
      const status = r.ok ? "OK" : "FAIL";
      const latency = r.latency_ms !== undefined ? `${r.latency_ms}ms` : "?ms";
      window.alert(`${status} (${latency}): ${r.message ?? ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("llm_test_failed", { role, error: msg });
      window.alert(`FAIL: ${msg}`);
    }
  }

  return (
    <article className="llm-conn-card">
      <h4>{title}</h4>
      {fields.map((f) => (
        <label key={f.key} className="conn-field">
          <span>{f.label}</span>
          <input
            type={f.type ?? "text"}
            readOnly={f.readonly}
            value={
              merged[f.key] === undefined || merged[f.key] === null
                ? ""
                : String(merged[f.key])
            }
            onChange={(e) => {
              // Reset the base if we were looking at a stale draft so
              // the merged view is consistent with the new edits.
              if (draftBaseKey !== configKey) setDraftBaseKey(configKey);
              setDraft({
                ...effectiveDraft,
                [f.key]:
                  f.type === "number"
                    ? Number(e.target.value)
                    : e.target.value,
              });
            }}
          />
        </label>
      ))}
      <div className="actions">
        <button
          onClick={() =>
            apply.mutate(effectiveDraft, {
              onSuccess: () => {
                setDraft({});
                setDraftBaseKey(configKey);
              },
            })
          }
          disabled={Object.keys(effectiveDraft).length === 0 || apply.isPending}
        >
          Save
        </button>
        <button onClick={test}>Test connection</button>
      </div>
    </article>
  );
}
