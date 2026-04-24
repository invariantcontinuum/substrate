import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { LeidenConfig } from "@/lib/leidenCache";

export interface CommunitySummary {
  community_count: number;
  modularity: number;
  largest_share: number;
  orphan_pct: number;
  community_sizes: number[];
}

export interface CommunityEntry {
  index: number;
  label: string;
  size: number;
  node_ids_sample: string[];
}

export interface CommunityResult {
  cache_key: string;
  cached: boolean;
  cached_at: string;
  expires_at: string;
  compute_ms: number;
  config_used: LeidenConfig;
  summary: CommunitySummary;
  communities: CommunityEntry[];
}

interface UseCommunitiesResult {
  data: CommunityResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  recompute: () => Promise<void>;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

/**
 * Fetches /api/communities for an active sync set + config. Re-runs
 * whenever ``syncIds`` or ``config`` changes. The ``recompute`` action
 * POSTs to ``/recompute`` to bypass the server cache (e.g. after the
 * user changes knobs mid-flight and wants a fresh computation without
 * nudging the cache-key hash).
 */
export function useCommunities(
  syncIds: string[],
  config: LeidenConfig | null,
): UseCommunitiesResult {
  const [data, setData] = useState<CommunityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (force = false) => {
    const tok = authToken();
    if (!tok || syncIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      let result: CommunityResult;
      if (force) {
        result = await apiFetch<CommunityResult>(
          "/api/communities/recompute",
          tok,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sync_ids: syncIds, config }),
          },
        );
      } else {
        const params = new URLSearchParams({
          sync_ids: syncIds.join(","),
        });
        if (config) params.set("config", JSON.stringify(config));
        result = await apiFetch<CommunityResult>(
          `/api/communities?${params.toString()}`,
          tok,
        );
      }
      setData(result);
    } catch (err) {
      logger.warn("communities_fetch_failed", { error: String(err) });
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (syncIds.length === 0) {
      setData(null);
      return;
    }
    void run(false);
    // Serialize the deps: a naive [syncIds, config] would re-fire on every
    // array/object identity change even when contents are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncIds.join(","), JSON.stringify(config)]);

  return {
    data,
    loading,
    error,
    refresh: () => run(false),
    recompute: () => run(true),
  };
}
