import { Search, Menu } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { useState, useCallback } from "react";
import { useSearch } from "@/hooks/useSearch";

export function TopBar() {
  const { connectionStatus, stats, searchQuery, setSearchQuery } = useGraphStore();
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

  // Mobile: just logo + hamburger
  if (!isDesktop) {
    return (
      <div
        className="flex items-center justify-between px-4"
        style={{
          height: 44, minHeight: 44,
          borderBottom: "1px solid var(--border)",
          background: "rgba(255,255,255,0.015)",
        }}
      >
        <button onClick={toggleSidebar} className="flex items-center justify-center w-8 h-8 rounded-md" style={{ color: "var(--text-muted)" }}>
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#6366f1", fontSize: 11, fontWeight: 800 }}>S</span>
          </div>
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Substrate
          </span>
        </div>
        <div style={{ width: 32 }} /> {/* Spacer for centering */}
      </div>
    );
  }

  // Desktop
  return (
    <div
      className="flex items-center px-4 gap-3"
      style={{
        height: 44, minHeight: 44,
        borderBottom: "1px solid var(--border)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#6366f1", fontSize: 11, fontWeight: 800 }}>S</span>
        </div>
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          Substrate
        </span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="flex items-center gap-1.5" style={{ width: 280 }}>
        <Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          placeholder="Search nodes..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={!graphLoaded}
          className="flex-1 text-[11px] bg-transparent outline-none"
          style={{
            color: "var(--text-primary)",
            fontFamily: "'JetBrains Mono', monospace",
            opacity: graphLoaded ? 1 : 0.3,
          }}
        />
      </div>

      <div className="w-px h-4" style={{ background: "var(--border)" }} />

      {/* Status + stats */}
      <div className="flex items-center gap-3 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="flex items-center gap-1.5">
          <div className="w-[5px] h-[5px] rounded-full" style={{
            background: connectionStatus === "connected" ? "#10b981" : connectionStatus === "reconnecting" ? "#f59e0b" : "#ef4444",
            boxShadow: connectionStatus === "connected" ? "0 0 6px #10b981" : "none",
          }} />
          <span style={{ color: connectionStatus === "connected" ? "#6ee7b7" : connectionStatus === "reconnecting" ? "#fcd34d" : "#fca5a5" }}>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span style={{ color: "var(--text-secondary)" }}><span style={{ color: "#a5b4fc" }}>{stats.nodeCount}</span> n</span>
        <span style={{ color: "var(--text-secondary)" }}><span style={{ color: "#a5b4fc" }}>{stats.edgeCount}</span> e</span>
        {stats.violationCount > 0 && (
          <span style={{ color: "#fca5a5" }}>&#x2298;{stats.violationCount}</span>
        )}
      </div>

      <div className="w-px h-4" style={{ background: "var(--border)" }} />

      {/* Avatar */}
      <button
        onClick={() => openModal("user")}
        className="flex items-center justify-center"
        style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}
      >
        <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 600 }}>U</span>
      </button>
    </div>
  );
}
