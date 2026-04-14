import { useCallback, useMemo, useState } from "react";
import { Search, Brain } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";
import { useSearch } from "@/hooks/useSearch";
import { Input } from "@/components/ui/input";

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  // Always seconds — two decimals gives sub-second precision for fast
  // loads (e.g. `0.23s`) without losing readability on slower ones
  // (e.g. `1.40s`).
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TopBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const stats = useGraphStore((s) => s.stats);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const { search } = useSearch();
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [q, setQ] = useState("");

  // Counts reflect what's painted on the canvas after legend filtering,
  // not raw DB totals.
  const visible = useMemo(() => {
    const keptNodes = nodes.filter((n) =>
      visibleTypes.has(String(n.type || "unknown")),
    );
    const keptIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = edges.filter(
      (e) => keptIds.has(e.source) && keptIds.has(e.target),
    );
    return { nodeCount: keptNodes.length, edgeCount: keptEdges.length };
  }, [nodes, edges, visibleTypes]);

  // 10s heartbeat against /api/graph/stats to detect gateway/upstream
  // health. Drives the status pill's colour; the label shows the last
  // graph-load round-trip so it's a concrete metric, not just "Live".
  const healthQuery = useQuery<{ status?: string }>({
    queryKey: ["health", "api-graph"],
    queryFn: () => apiFetch("/api/graph/stats", token),
    enabled: !!token,
    refetchInterval: 10_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const healthy = !healthQuery.isError && !healthQuery.isLoading;

  const loaded = nodes.length > 0;

  const go = useCallback(() => {
    if (!q.trim()) return;
    setSearchQuery(q.trim());
    search(q.trim());
  }, [q, setSearchQuery, search]);

  const roundTripLabel = formatDuration(stats.lastLoadMs);
  const serverLabel = formatDuration(stats.lastServerMs);
  const statusTitle = healthy
    ? `Last load: ${roundTripLabel} round-trip (${serverLabel} server)`
    : healthQuery.isError
    ? "Gateway or upstream unreachable"
    : "Checking connection…";

  return (
    <header className="top-nav">
      <div className="top-nav-brand-group" aria-label="Substrate">
        <span className="top-nav-brand-mark" aria-hidden="true">
          <Brain size={16} />
        </span>
        <span className="top-nav-brand">Substrate</span>
      </div>

      <div className="top-nav-center">
        <div className="top-nav-search">
          <Search size={12} />
          <Input
            type="text"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            disabled={!loaded}
          />
        </div>
      </div>

      <div className="top-nav-stats">
        <span title={`${visible.nodeCount} visible of ${nodes.length} loaded`}>
          {visible.nodeCount}n
        </span>
        <span title={`${visible.edgeCount} visible of ${edges.length} loaded`}>
          {visible.edgeCount}e
        </span>
        <div
          className={`top-nav-status ${healthy ? "is-healthy" : healthQuery.isError ? "is-down" : "is-pending"}`}
          title={statusTitle}
        >
          <div className={`status-dot ${healthy ? "on" : "off"}`} />
          <span className="top-nav-status-label">
            {healthy ? roundTripLabel : healthQuery.isError ? "off" : "…"}
          </span>
        </div>
        {stats.violationCount > 0 && <span>{stats.violationCount}</span>}
      </div>
    </header>
  );
}
