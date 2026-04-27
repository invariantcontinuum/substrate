import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

export interface Assignment {
  node_id: string;
  community_index: number;
}

interface UseAssignmentsResult {
  assignments: Map<string, number>;
  loading: boolean;
  error: string | null;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

/**
 * Streams ``/api/communities/assignments?cache_key=…`` as NDJSON and
 * exposes a ``Map<node_id, community_index>`` that grows incrementally.
 * For small graphs the whole map materialises quickly; for very large
 * graphs the slide engine can render communities before every node has
 * arrived (it filters cytoscape by membership).
 */
export function useAssignments(cacheKey: string | null): UseAssignmentsResult {
  const [assignments, setAssignments] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssignments(new Map());
      return;
    }
    const tok = authToken();
    if (!tok) return;

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const next = new Map<string, number>();

    (async () => {
      try {
        const resp = await fetch(
          `/api/communities/assignments?cache_key=${encodeURIComponent(
            cacheKey,
          )}`,
          {
            headers: { Authorization: `Bearer ${tok}` },
            signal: controller.signal,
          },
        );
        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastFlush = performance.now();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) return;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line) continue;
            try {
              const obj = JSON.parse(line) as Assignment;
              next.set(obj.node_id, obj.community_index);
            } catch (parseErr) {
              logger.warn("assignments_parse_failed", {
                error: String(parseErr),
              });
            }
          }
          // Throttle state updates — flushing every NDJSON row triggers
          // a re-render of every slide subscribed. 32 ms ≈ 30 fps.
          const now = performance.now();
          if (now - lastFlush > 32) {
            setAssignments(new Map(next));
            lastFlush = now;
          }
        }
        if (buffer) {
          try {
            const obj = JSON.parse(buffer) as Assignment;
            next.set(obj.node_id, obj.community_index);
          } catch {
            /* trailing whitespace — ignore */
          }
        }
        if (!cancelled) setAssignments(new Map(next));
      } catch (err) {
        if (!cancelled && (err as Error).name !== "AbortError") {
          setError(String(err));
          logger.warn("assignments_stream_failed", { error: String(err) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheKey]);

  return { assignments, loading, error };
}
