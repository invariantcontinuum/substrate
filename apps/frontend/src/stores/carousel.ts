import { create } from "zustand";

export interface LeidenConfig {
  resolution: number;
  beta: number;
  iterations: number;
  min_cluster_size: number;
  seed: number;
}

export interface CommunitySummary {
  community_count: number;
  modularity: number;
  community_sizes: number[];
  orphan_pct: number;
}

export interface CommunityResult {
  index: number;
  label: string;
  size: number;
}

interface CarouselState {
  stagedConfig: LeidenConfig;
  activeConfig: LeidenConfig;
  drift: boolean;
  summary: CommunitySummary | null;
  cacheKey: string | null;
  cachedAt: string | null;
  expiresAt: string | null;
  communities: CommunityResult[];
  labels: Record<number, string>;
  configUsed: LeidenConfig | null;
  orphanPct: number;

  setStaged: (partial: Partial<LeidenConfig>) => void;
  discardStaged: () => void;
  setResult: (result: {
    cacheKey: string;
    cachedAt: string;
    expiresAt: string;
    summary: CommunitySummary | null;
    communities: CommunityResult[];
    labels: Record<number, string>;
    configUsed: LeidenConfig | null;
    orphanPct: number;
  }) => void;
}

const DEFAULT_CONFIG: LeidenConfig = {
  resolution: 1.0,
  beta: 0.01,
  iterations: 10,
  min_cluster_size: 4,
  seed: 42,
};

function computeDrift(active: LeidenConfig, staged: LeidenConfig): boolean {
  return (
    active.resolution !== staged.resolution ||
    active.beta !== staged.beta ||
    active.iterations !== staged.iterations ||
    active.min_cluster_size !== staged.min_cluster_size ||
    active.seed !== staged.seed
  );
}

export const useCarouselStore = create<CarouselState>()((set, get) => ({
  stagedConfig: { ...DEFAULT_CONFIG },
  activeConfig: { ...DEFAULT_CONFIG },
  drift: false,
  summary: null,
  cacheKey: null,
  cachedAt: null,
  expiresAt: null,
  communities: [],
  labels: {},
  configUsed: null,
  orphanPct: 0,

  setStaged: (partial) => {
    const next = { ...get().stagedConfig, ...partial };
    set({ stagedConfig: next, drift: computeDrift(get().activeConfig, next) });
  },

  discardStaged: () => {
    set({ stagedConfig: { ...get().activeConfig }, drift: false });
  },

  setResult: (result) => {
    set({
      cacheKey: result.cacheKey,
      cachedAt: result.cachedAt,
      expiresAt: result.expiresAt,
      summary: result.summary,
      communities: result.communities,
      labels: result.labels,
      configUsed: result.configUsed,
      orphanPct: result.orphanPct,
      activeConfig: result.configUsed ? { ...result.configUsed } : get().activeConfig,
      stagedConfig: result.configUsed ? { ...result.configUsed } : get().stagedConfig,
      drift: false,
    });
  },
}));
