import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface ActivityItem {
  id: string;
  kind: string;
  ts: string;
  subject?: string;
  detail?: Record<string, unknown>;
}

export function useActivity(limit = 50) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = (window as Window & { __authToken?: string }).__authToken;
    if (!token) return;
    let cancelled = false;
    apiFetch<{ items: ActivityItem[]; next_cursor: string | null }>(
      `/api/activity?limit=${limit}`, token,
    ).then((d) => { if (!cancelled) setItems(d.items); })
     .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  return { items, loading };
}
