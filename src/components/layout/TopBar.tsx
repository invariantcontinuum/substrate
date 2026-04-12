import { Search } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useSearch } from "@/hooks/useSearch";
import { useState, useCallback } from "react";
import { Brain } from "lucide-react";

export function TopBar() {
  const { connectionStatus, stats, setSearchQuery } = useGraphStore();
  const { search } = useSearch();
  const [localQuery, setLocalQuery] = useState("");
  const graphLoaded = stats.nodeCount > 0;

  const handleSearch = useCallback(() => {
    if (!localQuery.trim()) return;
    setSearchQuery(localQuery.trim());
    search(localQuery.trim());
  }, [localQuery, setSearchQuery, search]);

  return (
    <div
      className="flex items-center px-3 gap-3"
      style={{
        height: "var(--topbar-height)",
        minHeight: "var(--topbar-height)",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      {/* Logo — left corner */}
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 24, height: 24, borderRadius: "var(--radius-sm)",
            background: "var(--accent-soft)", border: "1px solid var(--accent-medium)",
          }}
        >
          <Brain size={13} color="var(--accent)" />
        </div>
        <span
          className="text-[12px] font-semibold"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          Substrate
        </span>
      </div>

      <div className="flex-1" />

      {/* Search bar */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md"
        style={{ width: 240, background: "var(--bg-hover)", border: "1px solid var(--border)" }}
      >
        <Search size={12} style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          placeholder="Search graph..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={!graphLoaded}
          className="flex-1 text-[10px] bg-transparent outline-none"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            opacity: graphLoaded ? 1 : 0.3,
          }}
        />
      </div>

      <div className="w-px h-3.5" style={{ background: "var(--border)" }} />

      {/* Stats */}
      <div className="flex items-center gap-2.5 text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>
        <div className="flex items-center gap-1">
          <div
            className="w-[4px] h-[4px] rounded-full"
            style={{
              background: connectionStatus === "connected" ? "var(--success)" : connectionStatus === "reconnecting" ? "var(--warning)" : "var(--error)",
              boxShadow: connectionStatus === "connected" ? "0 0 6px var(--success)" : "none",
            }}
          />
          <span style={{
            color: connectionStatus === "connected" ? "var(--success-text)" : connectionStatus === "reconnecting" ? "var(--warning-text)" : "var(--error-text)",
          }}>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--accent-text)" }}>{stats.nodeCount}</span>n
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--accent-text)" }}>{stats.edgeCount}</span>e
        </span>
        {stats.violationCount > 0 && (
          <span style={{ color: "var(--error-text)" }}>&#x2298;{stats.violationCount}</span>
        )}
      </div>
    </div>
  );
}
