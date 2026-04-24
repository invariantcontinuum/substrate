import { create } from "zustand";

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
  /** Replace the whole prefs shape (used after hydrate + after server PUT). */
  replace: (next: Partial<Omit<PrefsState, "hydrated" | "setLeiden"
    | "setLayout" | "setTheme" | "setTelemetry" | "replace">>) => void;
}

export const DEFAULT_LEIDEN: LeidenPrefs = {
  resolution: 1.0,
  beta: 0.01,
  iterations: 10,
  min_cluster_size: 4,
  seed: 42,
};

export const usePrefsStore = create<PrefsState>((set) => ({
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
}));
