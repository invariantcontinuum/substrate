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
    <header>
      {!isDesktop && (
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
          <Menu size={18} />
        </Button>
      )}

      <div>
        <div>
          <Brain size={14} />
        </div>
        <span>Substrate</span>
      </div>

      <div />

      <div>
        <div>
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

      <div />

      <div>
        <div>
          <div />
          <span>
            {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "..." : "Off"}
          </span>
        </div>
        <span>
          <span>{stats.nodeCount}</span>n
        </span>
        <span>
          <span>{stats.edgeCount}</span>e
        </span>
        {stats.violationCount > 0 && (
          <span>{stats.violationCount}</span>
        )}
      </div>
    </header>
  );
}
