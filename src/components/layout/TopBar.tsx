import { Search, Menu } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { useState, useCallback } from "react";
import { useSearch } from "@/hooks/useSearch";

export function TopBar() {
  const { connectionStatus, stats, setSearchQuery } = useGraphStore();
  const { toggleSidebar, openModal } = useUIStore();
  const { isDesktop } = useResponsive();
  const { search } = useSearch();

  const [localQuery, setLocalQuery] = useState("");
  const graphLoaded = stats.nodeCount > 0;

  const handleSearch = useCallback(() => {
    if (!localQuery.trim()) return;
    setSearchQuery(localQuery.trim());
    search(localQuery.trim());
  }, [localQuery, setSearchQuery, search]);

  if (!isDesktop) {
    return (
      <div
        className="flex items-center justify-between px-3"
        style={{ height: "var(--topbar-height)", minHeight: "var(--topbar-height)", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <button onClick={toggleSidebar} className="flex items-center justify-center w-8 h-8 rounded-md" style={{ color: "var(--text-muted)" }}>
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", background: "var(--accent-soft)", border: "1px solid var(--accent-medium)" }}>
            <span style={{ color: "var(--accent)", fontSize: 10, fontWeight: 800 }}>S</span>
          </div>
          <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Substrate</span>
        </div>
        <div style={{ width: 32 }} />
      </div>
    );
  }

  return (
    <div
      className="flex items-center px-3 gap-3"
      style={{ height: "var(--topbar-height)", minHeight: "var(--topbar-height)", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: "var(--radius-sm)", background: "var(--accent-soft)", border: "1px solid var(--accent-medium)" }}>
          <span style={{ color: "var(--accent)", fontSize: 10, fontWeight: 800 }}>S</span>
        </div>
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Substrate</span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ width: 240, background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
        <Search size={12} style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          placeholder="Search..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={!graphLoaded}
          className="flex-1 text-[10px] bg-transparent outline-none"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", opacity: graphLoaded ? 1 : 0.3 }}
        />
      </div>

      <div className="w-px h-3.5" style={{ background: "var(--border)" }} />

      {/* Status + stats */}
      <div className="flex items-center gap-2.5 text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>
        <div className="flex items-center gap-1">
          <div className="w-[4px] h-[4px] rounded-full" style={{
            background: connectionStatus === "connected" ? "var(--success)" : connectionStatus === "reconnecting" ? "var(--warning)" : "var(--error)",
            boxShadow: connectionStatus === "connected" ? "0 0 6px var(--success)" : "none",
          }} />
          <span style={{ color: connectionStatus === "connected" ? "var(--success-text)" : connectionStatus === "reconnecting" ? "var(--warning-text)" : "var(--error-text)" }}>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span style={{ color: "var(--text-muted)" }}><span style={{ color: "var(--accent-text)" }}>{stats.nodeCount}</span>n</span>
        <span style={{ color: "var(--text-muted)" }}><span style={{ color: "var(--accent-text)" }}>{stats.edgeCount}</span>e</span>
        {stats.violationCount > 0 && (
          <span style={{ color: "var(--error-text)" }}>&#x2298;{stats.violationCount}</span>
        )}
      </div>

      <div className="w-px h-3.5" style={{ background: "var(--border)" }} />

      {/* Avatar */}
      <button
        onClick={() => openModal("user")}
        className="flex items-center justify-center"
        style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-soft)", border: "1px solid var(--accent-medium)" }}
      >
        <span style={{ fontSize: 9, color: "var(--accent-text)", fontWeight: 600 }}>U</span>
      </button>
    </div>
  );
}
