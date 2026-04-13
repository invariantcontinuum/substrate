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
    <header className="flex items-center gap-3 px-4 h-12 shrink-0 bg-background border-b border-border">
      {!isDesktop && (
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
          <Menu size={18} />
        </Button>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-6 h-6 rounded bg-primary/10 border border-primary/20">
          <Brain size={14} className="text-primary" />
        </div>
        <span className="text-sm font-semibold hidden sm:inline">Substrate</span>
      </div>

      <div className="flex-1" />

      <div className={cn("flex items-center gap-2", isDesktop ? "w-56" : "w-36")}>
        <div className="relative flex w-full items-center">
          <Search size={12} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            disabled={!loaded}
            className="h-7 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="w-px h-4 hidden sm:block bg-border" />

      <div className="items-center gap-3 text-xs hidden sm:flex font-mono">
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              connectionStatus === "connected" && "bg-green-500",
              connectionStatus === "reconnecting" && "bg-yellow-500",
              connectionStatus === "disconnected" && "bg-red-500"
            )}
          />
          <span
            className={cn(
              connectionStatus === "connected" && "text-green-400",
              connectionStatus === "reconnecting" && "text-yellow-400",
              connectionStatus === "disconnected" && "text-red-400"
            )}
          >
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span className="text-muted-foreground">
          <span className="text-primary font-semibold">{stats.nodeCount}</span>n
        </span>
        <span className="text-muted-foreground">
          <span className="text-primary font-semibold">{stats.edgeCount}</span>e
        </span>
        {stats.violationCount > 0 && (
          <span className="text-red-400 font-semibold">
            {stats.violationCount}
          </span>
        )}
      </div>
    </header>
  );
}
