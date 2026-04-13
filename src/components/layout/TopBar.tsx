import { useState, useCallback } from "react";
import { Search, Brain, Menu } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useSearch } from "@/hooks/useSearch";
import { useResponsive } from "@/hooks/useResponsive";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      className="flex items-center gap-2.5 px-3 shrink-0 h-11 min-h-11 bg-[var(--bg-glass)] backdrop-blur-md border-b border-[var(--border-glass)] relative z-5"
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
          className="flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[var(--accent-soft)] border border-[var(--accent-medium)]"
        >
          <Brain size={12} className="text-[var(--accent-brand)]" />
        </div>
        <span
          className="text-[12px] font-semibold hidden sm:inline text-[var(--text-primary)] tracking-tight"
        >
          Substrate
        </span>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div
        className={cn("flex items-center gap-1.5", isDesktop ? "w-[220px]" : "w-[140px]")}
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

      <div className="w-px h-3 hidden sm:block bg-[var(--border-glass)]" />

      {/* Stats */}
      <div className="items-center gap-2 text-[10px] hidden sm:flex font-mono">
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              connectionStatus === "connected" && "bg-[var(--success)] shadow-[0_0_8px_var(--success)]",
              connectionStatus === "reconnecting" && "bg-[var(--warning)]",
              connectionStatus === "disconnected" && "bg-[var(--error)]",
            )}
          />
          <span
            className={cn(
              "font-medium",
              connectionStatus === "connected" && "text-[var(--success-text)]",
              connectionStatus === "reconnecting" && "text-[var(--warning-text)]",
              connectionStatus === "disconnected" && "text-[var(--error-text)]",
            )}
          >
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span className="text-[var(--text-muted)]">
          <span className="text-[var(--accent-brand)] font-semibold">{stats.nodeCount}</span>n
        </span>
        <span className="text-[var(--text-muted)]">
          <span className="text-[var(--accent-brand)] font-semibold">{stats.edgeCount}</span>e
        </span>
        {stats.violationCount > 0 && (
          <span className="text-[var(--error-text)] font-semibold">&#x2298;{stats.violationCount}</span>
        )}
      </div>
    </header>
  );
}
