import { create } from "zustand";

interface PrefsState {
  leiden: {
    resolution: number;
    beta: number;
    iterations: number;
    min_cluster_size: number;
    seed: number;
  };
}

const DEFAULT_LEIDEN = {
  resolution: 1.0,
  beta: 0.01,
  iterations: 10,
  min_cluster_size: 4,
  seed: 42,
};

export const usePrefsStore = create<PrefsState>(() => ({
  leiden: { ...DEFAULT_LEIDEN },
}));
