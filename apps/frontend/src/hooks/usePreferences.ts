import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { usePrefsStore } from "@/stores/prefs";

interface ServerPrefs {
  prefs: {
    leiden?: Partial<import("@/stores/prefs").LeidenPrefs>;
    layout?: import("@/stores/prefs").LayoutPref;
    theme?: import("@/stores/prefs").ThemePref;
    telemetry?: boolean;
    schema_version?: number;
  };
  updated_at: string | null;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

/**
 * Hydrates the prefs store from `/api/users/me/preferences` once per mount
 * and writes back every time the local store changes. The write is
 * fire-and-forget; failures surface only in the logger so the UI stays
 * responsive. Callers are the AccountDefaultsTab and any place that
 * reads prefs before the store has been hydrated.
 */
export function usePreferences(): void {
  const replace = usePrefsStore((s) => s.replace);
  const hydrated = usePrefsStore((s) => s.hydrated);
  const firstRun = useRef(true);

  useEffect(() => {
    if (hydrated) return;
    const tok = authToken();
    if (!tok) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiFetch<ServerPrefs>(
          "/api/users/me/preferences", tok,
        );
        if (cancelled) return;
        replace(resp.prefs);
      } catch (err) {
        logger.warn("prefs_hydrate_failed", { error: String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, replace]);

  useEffect(() => {
    if (!hydrated) return;
    if (firstRun.current) { firstRun.current = false; return; }
    const unsub = usePrefsStore.subscribe((state) => {
      const tok = authToken();
      if (!tok) return;
      const body = {
        leiden: state.leiden,
        layout: state.layout,
        theme: state.theme,
        telemetry: state.telemetry,
      };
      void apiFetch("/api/users/me/preferences", tok, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch((err) => {
        logger.warn("prefs_persist_failed", { error: String(err) });
      });
    });
    return () => unsub();
  }, [hydrated]);
}
