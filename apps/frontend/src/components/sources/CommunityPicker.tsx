import { useState, useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Community {
  index: number;
  label?: string;
  size: number;
}

interface Props {
  snapshotIds: string[];
  /** Selection plus the cache_key the entries belong to. */
  value: { cache_key: string; community_index: number }[];
  onChange: (next: { cache_key: string; community_index: number }[]) => void;
}

export function CommunityPicker({ snapshotIds, value, onChange }: Props) {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshotKey = snapshotIds.slice().sort().join(",");
  useEffect(() => {
    if (cacheKey != null) setStale(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only on snapshot change
  }, [snapshotKey]);

  const load = async () => {
    if (snapshotIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        cache_key: string;
        communities: Community[];
      }>(
        `/api/communities?sync_ids=${encodeURIComponent(snapshotIds.join(","))}`,
        token,
      );
      setCacheKey(data.cache_key);
      setCommunities(data.communities);
      setStale(false);
      onChange([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (idx: number) => {
    if (!cacheKey) return;
    const exists = value.some(
      (v) => v.cache_key === cacheKey && v.community_index === idx,
    );
    if (exists) {
      onChange(
        value.filter(
          (v) => !(v.cache_key === cacheKey && v.community_index === idx),
        ),
      );
    } else {
      onChange([...value, { cache_key: cacheKey, community_index: idx }]);
    }
  };

  return (
    <div className="community-picker">
      <Button
        type="button"
        disabled={snapshotIds.length === 0 || loading}
        onClick={() => {
          void load();
        }}
      >
        {loading ? "Loading…" : cacheKey ? "Reload communities" : "Load communities"}
      </Button>
      {error && <p className="muted community-picker-error">Failed to load: {error}</p>}
      {stale && cacheKey && (
        <p className="muted">Snapshots changed — reload communities.</p>
      )}
      {cacheKey && communities.length > 0 && (
        <ul
          className={`community-picker-list${stale ? " is-stale" : ""}`}
          aria-disabled={stale}
        >
          {communities.map((c) => {
            const checked = value.some(
              (v) => v.cache_key === cacheKey && v.community_index === c.index,
            );
            return (
              <li key={c.index}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={stale}
                    onChange={() => toggle(c.index)}
                  />
                  Community {c.index} · {c.size} nodes
                  {c.label ? ` · "${c.label}"` : ""}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
