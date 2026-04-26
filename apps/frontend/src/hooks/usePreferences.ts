import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { usePrefsStore, type ServerPrefsShape } from "@/stores/prefs";

interface ServerPrefs {
  prefs: ServerPrefsShape;
  updated_at: string | null;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

/**
 * Hydrates the prefs store from `/api/users/me/preferences` once per mount
 * and writes back every time the local store changes. The write is
 * fire-and-forget; failures surface only in the logger so the UI stays
 * responsive. Callers are the Settings Graph tab (and follow-up tabs)
 * and any place that reads prefs before the store has been hydrated.
 */
export function usePreferences(): void {
  const replace = usePrefsStore((s) => s.replace);
  const hydrated = usePrefsStore((s) => s.hydrated);

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
    // Subscribe to all future store updates and fire-and-forget a PUT
    // back to the server. zustand's `subscribe` does NOT invoke the
    // listener immediately on registration, so no "first-fire" guard
    // is needed — the previous version's `firstRun.current` short-
    // circuit aborted the effect entirely and silently dropped the
    // server write path.
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
