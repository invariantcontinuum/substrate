import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface SnapshotDelta {
  prior_sync_id: string | null;
  prior_completed_at: string | null;
  delta: {
    node_count: number;
    edge_count: number;
    community_count: number;
    modularity: number;
    files_indexed: number;
    storage_bytes: number;
  } | null;
}

export function useSnapshotDelta(syncId: string | null) {
  const [data, setData] = useState<SnapshotDelta | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!syncId) return;
    const token = (window as Window & { __authToken?: string }).__authToken;
    if (!token) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
    });
    apiFetch<SnapshotDelta>(`/api/syncs/${encodeURIComponent(syncId)}/delta`, token)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [syncId]);

  return { data, loading };
}
