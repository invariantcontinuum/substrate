import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useSearch } from "@/hooks/useSearch";
import { useGraphStore } from "@/stores/graph";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function SearchModal() {
  const { activeModal, closeModal } = useUIStore();
  const { results, searching, search, clearResults } = useSearch();
  const setSearchQuery = useGraphStore((s) => s.setSearchQuery);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");

  const handleSearch = useCallback(() => {
    search(query, typeFilter || undefined, domainFilter || undefined);
  }, [query, typeFilter, domainFilter, search]);

  const handleSelectResult = (nodeId: string) => {
    setSearchQuery(nodeId);
    closeModal();
  };

  return (
    <Modal open={activeModal === "search"} onClose={() => { closeModal(); clearResults(); }} title="Search" maxWidth={560}>
      <div className="flex flex-col gap-5">
        <div className="flex gap-3">
          <Input
            type="text"
            placeholder="Search nodes semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 text-xs"
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={!query.trim() || searching}
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </Button>
        </div>

        <div className="flex gap-3">
          <Input
            type="text"
            placeholder="Filter by category..."
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1"
          />
          <Input
            type="text"
            placeholder="Filter by domain..."
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="flex-1"
          />
        </div>

        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {results.length} results
            </Label>
            {results.map((r) => (
              <button
                key={r.node_id}
                onClick={() => handleSelectResult(r.node_id)}
                className="flex flex-col gap-1 rounded-md border bg-muted/50 px-4 py-3.5 text-left transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {r.name || r.node_id.split("/").pop()}
                  </span>
                  {r.category && (
                    <Badge variant="secondary" className="text-[9px] px-2 py-0.5">
                      {r.category}
                    </Badge>
                  )}
                  {r.language && (
                    <Badge variant="outline" className="text-[9px] px-2 py-0.5">
                      {r.language}
                    </Badge>
                  )}
                </div>
                {r.description && (
                  <span className="text-[11px] leading-relaxed text-muted-foreground">{r.description}</span>
                )}
                <span className="text-[9px] font-mono text-muted-foreground">
                  {r.node_id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
