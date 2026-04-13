import { useState, useCallback } from "react";
import { Search, Brain, Menu } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useSearch } from "@/hooks/useSearch";
import { useResponsive } from "@/hooks/useResponsive";

export function TopBar() {
  const { connectionStatus, stats, setSearchQuery } = useGraphStore();
  const { toggleSidebar } = useUIStore();
  const { search } = useSearch();
  const { isDesktop } = useResponsive();
  const [q, setQ] = useState("");
  const loaded = stats.nodeCount > 0;

  const go = useCallback(() => {
    if (!q.trim()) return;
    setSearchQuery(q.trim());
    search(q.trim());
  }, [q, setSearchQuery, search]);

  return (
    <header
      className="flex items-center gap-4 px-5 sm:px-6 shrink-0"
      style={{
        height: "var(--topbar-height)",
        minHeight: "var(--topbar-height)",
        background: "var(--bg-surface)",
        backdropFilter: "blur(var(--overlay-blur))",
        WebkitBackdropFilter: "blur(var(--overlay-blur))",
        borderBottom: "1px solid var(--border)",
        zIndex: 5,
        position: "relative",
      }}
    >
      {/* Mobile hamburger */}
      {!isDesktop && (
        <button
          onClick={toggleSidebar}
          className="glass-btn flex items-center justify-center"
          style={{
            width: 38, height: 38, color: "var(--text-muted)",
            borderRadius: "var(--radius-md)", padding: 0,
          }}
        >
          <Menu size={18} />
        </button>
      )}

      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 32, height: 32, borderRadius: "var(--radius-md)",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-medium)",
          }}
        >
          <Brain size={16} color="var(--accent)" />
        </div>
        <span
          className="text-[13px] font-bold hidden sm:inline font-display"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}
        >
          Substrate
        </span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div
        className="flex items-center gap-2"
        style={{ width: isDesktop ? 260 : 170 }}
      >
        <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          disabled={!loaded}
          className="glass-input flex-1 min-w-0"
          style={{
            opacity: loaded ? 1 : 0.3,
          }}
        />
      </div>

      {/* Stats */}
      <div
        className="items-center gap-3 text-[10px] hidden sm:flex"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <div className="flex items-center gap-1.5">
          <div
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connectionStatus === "connected" ? "var(--success)"
                : connectionStatus === "reconnecting" ? "var(--warning)" : "var(--error)",
              boxShadow: connectionStatus === "connected" ? "0 0 8px var(--success)" : "none",
            }}
          />
          <span style={{
            fontWeight: 500,
            color: connectionStatus === "connected" ? "var(--success-text)"
              : connectionStatus === "reconnecting" ? "var(--warning-text)" : "var(--error-text)",
          }}>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>{stats.nodeCount}</span>n
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>{stats.edgeCount}</span>e
        </span>
        {stats.violationCount > 0 && (
          <span style={{ color: "var(--error-text)", fontWeight: 600 }}>&#x2298;{stats.violationCount}</span>
        )}
      </div>
    </header>
  );
}
