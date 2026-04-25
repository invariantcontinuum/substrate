import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LeidenPrefs {
  resolution: number;
  beta: number;
  iterations: number;
  min_cluster_size: number;
  seed: number;
}

export type ThemePref = "system" | "light" | "dark";
export type LayoutPref = "force-directed" | "hierarchical";

export interface PrefsState {
  leiden: LeidenPrefs;
  layout: LayoutPref;
  theme: ThemePref;
  telemetry: boolean;
  schema_version: number;
  /** True once the store has been hydrated from /api/users/me/preferences. */
  hydrated: boolean;

  setLeiden: (patch: Partial<LeidenPrefs>) => void;
  setLayout: (layout: LayoutPref) => void;
  setTheme: (theme: ThemePref) => void;
  setTelemetry: (telemetry: boolean) => void;
  /** Replace the whole prefs shape (used after hydrate + after server PUT).
   *  Accepts partial values — any missing field keeps the current value,
   *  which is what the server-side deep-merge guarantees anyway. */
  replace: (next: ServerPrefsShape) => void;
}

export interface ServerPrefsShape {
  leiden?: Partial<LeidenPrefs>;
  layout?: LayoutPref;
  theme?: ThemePref;
  telemetry?: boolean;
  schema_version?: number;
}

export const DEFAULT_LEIDEN: LeidenPrefs = {
  resolution: 1.0,
  beta: 0.01,
  iterations: 10,
  min_cluster_size: 4,
  seed: 42,
};

/**
 * `persist` keeps theme/layout/telemetry/leiden in localStorage so the
 * preferred theme paints on first reload before the async server
 * hydrate completes — no flash-of-default-palette. The `replace` action
 * (called after the server fetches the canonical prefs) reconciles
 * server values into the local copy. `hydrated` is intentionally NOT
 * persisted — every reload should re-fetch from the server so the
 * local copy doesn't drift behind device-cross-edits.
 */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      leiden: { ...DEFAULT_LEIDEN },
      layout: "force-directed",
      theme: "system",
      telemetry: true,
      schema_version: 1,
      hydrated: false,

      setLeiden: (patch) =>
        set((s) => ({ leiden: { ...s.leiden, ...patch } })),
      setLayout: (layout) => set({ layout }),
      setTheme: (theme) => set({ theme }),
      setTelemetry: (telemetry) => set({ telemetry }),
      replace: (next) =>
        set((s) => ({
          leiden: next.leiden ? { ...s.leiden, ...next.leiden } : s.leiden,
          layout: next.layout ?? s.layout,
          theme: next.theme ?? s.theme,
          telemetry: next.telemetry ?? s.telemetry,
          schema_version: next.schema_version ?? s.schema_version,
          hydrated: true,
        })),
    }),
    {
      name: "substrate-prefs.v1",
      partialize: (s) => ({
        leiden: s.leiden,
        layout: s.layout,
        theme: s.theme,
        telemetry: s.telemetry,
        schema_version: s.schema_version,
      }),
    },
  ),
);
