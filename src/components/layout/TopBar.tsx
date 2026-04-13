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
    <header className="flex items-center gap-3 px-4 h-14 border-b border-black bg-white">
      {!isDesktop && (
        <Button onClick={toggleSidebar}>
          <Menu size={18} />
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Brain size={16} className="text-black" />
        <span className="text-black">Substrate</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Search size={12} className="text-black" />
        <Input
          type="text"
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          disabled={!loaded}
        />
      </div>

      <div className="hidden sm:flex items-center gap-3 text-black">
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 border border-black", connectionStatus === "connected" ? "bg-black" : "bg-white")} />
          <span>{connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}</span>
        </div>
        <span>{stats.nodeCount}n</span>
        <span>{stats.edgeCount}e</span>
        {stats.violationCount > 0 && <span>{stats.violationCount}</span>}
      </div>
    </header>
  );
}
