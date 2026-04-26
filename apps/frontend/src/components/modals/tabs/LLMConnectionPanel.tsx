/**
 * Per-role LLM Connection panel.
 *
 * The Settings → LLM Connections tab renders one of these at a time
 * (selected via the sub-tab strip in `SettingsLLMTab`). The panel:
 *
 *   * Reads the matching `llm_<role>` section via
 *     `useEffectiveConfig(section)` — the gateway returns the panel's
 *     six wire fields directly (`name`, `url`, `api_key`,
 *     `context_window_tokens`, `timeout_s`, `ssl_verify`).
 *   * Tracks an in-progress draft, exactly like the Postgres tab.
 *   * Saves only the diff'd fields via `useApplyConfig(section)`.
 *   * Resets the role's overrides (back to yaml + env + defaults) via
 *     `useResetConfig(section)`.
 *   * Probes the *current* (unsaved) form values via
 *     `POST /api/llm/{role}/test` so the user can verify the URL +
 *     credential before committing the diff.
 */
import { useState } from "react";
import {
  useEffectiveConfig,
  useApplyConfig,
  useResetConfig,
} from "@/hooks/useRuntimeConfig";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { logger } from "@/lib/logger";

export type LLMConnectionRole = "dense" | "sparse" | "embedding" | "reranker";

interface ConnConfig {
  name?: string;
  url?: string;
  api_key?: string;
  context_window_tokens?: number;
  timeout_s?: number;
  ssl_verify?: boolean;
}

interface ProbeResponse {
  ok: boolean;
  latency_ms: number;
  model: string;
  error?: string | null;
}

interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

const isValidUrl = (raw: string): boolean => {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export function LLMConnectionPanel({ role }: { role: LLMConnectionRole }) {
  const section = `llm_${role}`;
  const { config, refetch } = useEffectiveConfig<ConnConfig>(section);
  const apply = useApplyConfig(section);
  const reset = useResetConfig(section);
  const token = useAuthToken();

  const [draft, setDraft] = useState<Partial<ConnConfig>>({});
  // When a successful PUT or an SSE config.updated event invalidates
  // the cache, the section snapshot identity flips. Clear the local
  // draft inline instead of via useEffect (mirrors the previous card).
  const configKey = JSON.stringify(config);
  const [draftBaseKey, setDraftBaseKey] = useState<string>(configKey);
  const effectiveDraft: Partial<ConnConfig> =
    draftBaseKey === configKey ? draft : {};

  const merged: ConnConfig = { ...config, ...effectiveDraft };

  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const dirty = Object.keys(effectiveDraft).length > 0;
  const urlValid = isValidUrl(merged.url ?? "");
  const canSave = dirty && urlValid && !apply.isPending;

  function setField<K extends keyof ConnConfig>(
    key: K,
    value: ConnConfig[K] | undefined,
  ): void {
    if (draftBaseKey !== configKey) setDraftBaseKey(configKey);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onTest(): Promise<void> {
    if (!token || !urlValid) return;
    setProbing(true);
    setProbe(null);
    const body: ConnConfig = {
      name: merged.name ?? "",
      url: merged.url ?? "",
      api_key: merged.api_key ?? "",
      context_window_tokens: merged.context_window_tokens,
      timeout_s: merged.timeout_s ?? 10,
      ssl_verify: merged.ssl_verify ?? true,
    };
    try {
      const r = await apiFetch<ProbeResponse>(
        `/api/llm/${role}/test`,
        token,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setProbe({
        ok: r.ok,
        latencyMs: r.latency_ms,
        message: r.ok ? `OK · ${r.model}` : (r.error ?? "probe failed"),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("llm_test_failed", { role, error: msg });
      setProbe({ ok: false, latencyMs: 0, message: msg });
    } finally {
      setProbing(false);
    }
  }

  function onSave(): void {
    if (!canSave) return;
    apply.mutate(effectiveDraft as Record<string, unknown>, {
      onSuccess: () => {
        setDraft({});
        setDraftBaseKey(configKey);
      },
    });
  }

  function onReset(): void {
    if (reset.isPending) return;
    reset.mutate(undefined, {
      onSuccess: () => {
        setDraft({});
        refetch();
      },
    });
  }

  return (
    <section className="llm-conn-panel" data-role={role}>
      <div className="llm-conn-panel__grid">
        <Field label="Name">
          <input
            type="text"
            value={merged.name ?? ""}
            onChange={(e) => setField("name", e.target.value)}
            placeholder={role}
          />
        </Field>
        <Field label="URL" error={!urlValid && (merged.url ?? "").length > 0
            ? "must be a valid http(s) URL"
            : undefined}>
          <input
            type="url"
            value={merged.url ?? ""}
            onChange={(e) => setField("url", e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="API key">
          <input
            type="password"
            value={merged.api_key ?? ""}
            onChange={(e) => setField("api_key", e.target.value)}
            placeholder="(leave empty for no auth)"
            autoComplete="off"
          />
        </Field>
        <Field label="Context window (tokens)">
          <input
            type="number"
            min={0}
            value={
              merged.context_window_tokens === undefined
                ? ""
                : String(merged.context_window_tokens)
            }
            onChange={(e) => {
              const v = e.target.value;
              setField(
                "context_window_tokens",
                v === "" ? undefined : Number(v),
              );
            }}
          />
        </Field>
        <Field label="Timeout (s)">
          <input
            type="number"
            min={0}
            step="0.1"
            value={merged.timeout_s === undefined ? "" : String(merged.timeout_s)}
            onChange={(e) => {
              const v = e.target.value;
              setField("timeout_s", v === "" ? undefined : Number(v));
            }}
          />
        </Field>
        <label className="llm-conn-panel__toggle">
          <input
            type="checkbox"
            checked={merged.ssl_verify ?? true}
            onChange={(e) => setField("ssl_verify", e.target.checked)}
          />
          <span>SSL verify</span>
        </label>
      </div>

      {probe && (
        <div
          className={`llm-conn-panel__probe ${
            probe.ok ? "is-ok" : "is-fail"
          }`}
          role="status"
        >
          <span className="llm-conn-panel__probe-dot" aria-hidden="true" />
          <span>
            {probe.ok ? "Connected" : "Failed"} · {probe.latencyMs}ms
            {probe.message ? ` · ${probe.message}` : ""}
          </span>
        </div>
      )}

      <div className="llm-conn-panel__actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={!canSave}
        >
          {apply.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onReset}
          disabled={reset.isPending}
        >
          {reset.isPending ? "Resetting…" : "Reset"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onTest}
          disabled={probing || !urlValid}
        >
          {probing ? "Testing…" : "Test connection"}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="llm-conn-panel__field">
      <span className="llm-conn-panel__field-label">{label}</span>
      {children}
      {error && <span className="llm-conn-panel__field-error">{error}</span>}
    </label>
  );
}
