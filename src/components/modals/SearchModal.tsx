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
      <div>
        <div>
          <Input
            type="text"
            placeholder="Search nodes semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            autoFocus
          />
          <Button onClick={handleSearch} disabled={!query.trim() || searching}>
            {searching ? <Loader2 size={14} /> : <Search size={14} />}
            Search
          </Button>
        </div>

        <div>
          <Input type="text" placeholder="Filter by category..." value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
          <Input type="text" placeholder="Filter by domain..." value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} />
        </div>

        {results.length > 0 && (
          <div>
            <Label>{results.length} results</Label>
            {results.map((r) => (
              <button key={r.node_id} onClick={() => handleSelectResult(r.node_id)}>
                <div>
                  <span>{r.name || r.node_id.split("/").pop()}</span>
                  {r.category && <Badge>{r.category}</Badge>}
                  {r.language && <Badge>{r.language}</Badge>}
                </div>
                {r.description && <span>{r.description}</span>}
                <span>{r.node_id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
