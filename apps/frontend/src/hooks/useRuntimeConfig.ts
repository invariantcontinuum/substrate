/**
 * Hooks that read/write per-section runtime config through the gateway.
 *
 * `useEffectiveConfig(section)` is a thin GET wrapper around the
 * `GET /api/config/{section}` proxy — the gateway forwards to the
 * owning service's `GET /internal/config/{section}` route, which returns
 * the merged effective settings (defaults < yaml < env < runtime
 * overlay). The frontend therefore never recomputes the merge itself.
 *
 * `useApplyConfig(section)` posts a partial patch via
 * `PUT /api/config/{section}`. Top-level keys in the body are upserted
 * into `runtime_config`; the gateway then emits an SSE
 * `config.updated` event so the owning service refreshes its overlay
 * live (no container restart). On mutation success the matching
 * React Query cache (`["config", section]`) is invalidated so the
 * UI immediately reads the new effective values without waiting for
 * the SSE round-trip.
 *
 * SSE invalidation. The Settings tabs are typically the only callers
 * that PUT, but a `config.updated` event can also originate from a
 * different device/admin tool. The matching query cache is invalidated
 * by `useConfigSseInvalidate()` (mounted by the app shell once);
 * each tab just reads the cache and re-renders.
 */
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { openSseClient } from "@/lib/sse";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useAuthedQuery } from "@/hooks/useAuthedQuery";

export type RuntimeConfigSection = Record<string, unknown>;

export interface UseEffectiveConfigResult<T> {
  config: T;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * `T` is intentionally NOT constrained to ``Record<string, unknown>``
 * — declaring an index signature on the per-tab interfaces (e.g.
 * ``GraphConfig``) would defeat their documentation value, so we
 * accept any object shape and rely on the caller to pin each field's
 * type.
 */
export function useEffectiveConfig<T extends object = RuntimeConfigSection>(
  section: string,
): UseEffectiveConfigResult<T> {
  const q = useAuthedQuery<T>(["config", section], `/api/config/${section}`);
  return {
    config: (q.data ?? ({} as T)),
    isLoading: q.isLoading,
    refetch: () => {
      void q.refetch();
    },
  };
}

export interface ApplyConfigResponse {
  applied: Record<string, unknown>;
  scope: string;
}

export interface ApplyConfigOptions {
  /** Extra request headers — required for risk-gated sections such as
   *  `postgres`, which the gateway rejects with 428 unless the caller
   *  attaches the matching ``X-Substrate-Confirm-Risk`` header. */
  headers?: Record<string, string>;
}

/**
 * Mutate a single config section. Body is a *partial* patch — only the
 * keys you supply are upserted; existing values for omitted keys are
 * preserved.
 *
 * The hook returns a normal react-query `useMutation` result so callers
 * can use `mutate(payload, { onSuccess })`, `isPending`, etc.
 *
 * Per-call header overrides land via the second argument to
 * `mutate(vars, { ... })`. We pluck them off the variables shape so the
 * caller can pass `{ payload, headers }` explicitly. (See the Postgres
 * tab for the only place that sets headers today.)
 */
export function useApplyConfig(
  section: string,
): UseMutationResult<
  ApplyConfigResponse,
  Error,
  Record<string, unknown> | { payload: Record<string, unknown>; headers?: Record<string, string> }
> {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation<
    ApplyConfigResponse,
    Error,
    Record<string, unknown> | { payload: Record<string, unknown>; headers?: Record<string, string> }
  >({
    mutationFn: async (vars) => {
      const isWrapped =
        typeof vars === "object" &&
        vars !== null &&
        "payload" in (vars as Record<string, unknown>);
      const payload = isWrapped
        ? ((vars as { payload: Record<string, unknown> }).payload)
        : (vars as Record<string, unknown>);
      const extraHeaders = isWrapped
        ? ((vars as { headers?: Record<string, string> }).headers ?? {})
        : {};
      return apiFetch<ApplyConfigResponse>(`/api/config/${section}`, token, {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: extraHeaders as HeadersInit,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", section] });
    },
  });
}

/**
 * Subscribe to SSE `config.updated` events and invalidate the matching
 * `["config", section]` cache. Mount once at the app shell — the tabs
 * themselves don't need to subscribe because react-query will refetch
 * any active query that is invalidated.
 */
export function useConfigSseInvalidate(): void {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) return;
    const client = openSseClient("/api/events", { token });
    client.on("config.updated", (ev) => {
      const section = (ev.payload as { section?: string } | undefined)?.section;
      if (!section) return;
      qc.invalidateQueries({ queryKey: ["config", section] });
    });
    client.on("token_expired", () => client.close());
    client.on("stream_dropped", () => client.close());
    return () => client.close();
  }, [qc, token]);
}
