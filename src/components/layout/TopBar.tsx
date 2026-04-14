import { useCallback, useMemo, useState } from "react";
import { Search, Brain } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useSearch } from "@/hooks/useSearch";
import { Input } from "@/components/ui/input";

export function TopBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const stats = useGraphStore((s) => s.stats);
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { search } = useSearch();
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [q, setQ] = useState("");

  // Live counts mirror what's actually painted on the graph canvas,
  // i.e. nodes whose type is currently toggled on in the legend plus the
  // edges whose endpoints both survive. This stays in sync automatically
  // because it's derived from the same zustand slices GraphCanvas reads.
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

  // Live connection status — a 10s heartbeat against the gateway health
  // check. React-query's `status` flips quickly when connectivity
  // changes (offline, gateway restart, upstream down) without us having
  // to thread a websocket through.
  const healthQuery = useQuery<{ status: string }>({
    queryKey: ["health", "api-graph"],
    queryFn: () => apiFetch("/api/graph/stats", token),
    enabled: !!token,
    refetchInterval: 10_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const connectionStatus: "connected" | "reconnecting" | "disconnected" =
    healthQuery.isLoading
      ? "reconnecting"
      : healthQuery.isError
      ? "disconnected"
      : "connected";

  const loaded = nodes.length > 0;

  const go = useCallback(() => {
    if (!q.trim()) return;
    setSearchQuery(q.trim());
    search(q.trim());
  }, [q, setSearchQuery, search]);

  return (
    <header className="top-nav">
      <button onClick={toggleSidebar} className="top-nav-menu-btn" title="Toggle navigation">
        <Brain size={16} />
      </button>

      <span className="top-nav-brand">Substrate</span>

      <div className="top-nav-spacer" />

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

      <div className="top-nav-stats">
        <span title={`${visible.nodeCount} visible of ${nodes.length} loaded`}>
          {visible.nodeCount}n
        </span>
        <span title={`${visible.edgeCount} visible of ${edges.length} loaded`}>
          {visible.edgeCount}e
        </span>
        <div className="top-nav-status">
          <div className={`status-dot ${connectionStatus === "connected" ? "on" : "off"}`} />
          <span>
            {connectionStatus === "connected"
              ? "Live"
              : connectionStatus === "reconnecting"
              ? "..."
              : "Off"}
          </span>
        </div>
        {stats.violationCount > 0 && <span>{stats.violationCount}</span>}
      </div>
    </header>
  );
}
