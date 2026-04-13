import { useState, useCallback } from "react";
import { Search, Brain, Menu } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useSearch } from "@/hooks/useSearch";
import { useResponsive } from "@/hooks/useResponsive";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
      className="flex items-center gap-2 px-2 sm:px-3 shrink-0"
      style={{
        height: "var(--topbar-height)",
        minHeight: "var(--topbar-height)",
        background: "var(--bg-glass)",
        backdropFilter: "blur(var(--overlay-blur))",
        WebkitBackdropFilter: "blur(var(--overlay-blur))",
        borderBottom: "1px solid var(--border-glass)",
        zIndex: 5,
        position: "relative",
      }}
    >
      {/* Mobile hamburger */}
      {!isDesktop && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
        >
          <Menu size={18} />
        </Button>
      )}

      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center justify-center"
          style={{
            width: 22, height: 22, borderRadius: "var(--radius-sm)",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-medium)",
          }}
        >
          <Brain size={12} color="var(--accent)" />
        </div>
        <span
          className="text-[12px] font-semibold hidden sm:inline"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          Substrate
        </span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div
        className="flex items-center gap-1.5"
        style={{ width: isDesktop ? 220 : 140 }}
      >
        <div className="relative flex w-full items-center">
          <Search size={11} className="pointer-events-none absolute left-2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            disabled={!loaded}
            className="h-7 pl-6 text-[10px] font-mono"
          />
        </div>
      </div>

      <div className="w-px h-3 hidden sm:block" style={{ background: "var(--border-glass)" }} />

      {/* Stats */}
      <div
        className="items-center gap-2 text-[10px] hidden sm:flex"
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
