import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useSearch } from "@/hooks/useSearch";
import { useGraphStore } from "@/stores/graph";
import { Search, Loader2 } from "lucide-react";

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
      <div className="flex flex-col gap-4">
        {/* Search input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search nodes semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 text-[12px] px-3 py-2.5 rounded-lg outline-none"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-primary)",
            }}
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[12px] font-medium"
            style={{
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#a5b4fc",
              opacity: !query.trim() || searching ? 0.4 : 1,
            }}
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Filter by category..."
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
          />
          <input
            type="text"
            placeholder="Filter by domain..."
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
          />
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wider mb-1 font-medium" style={{ color: "var(--text-muted)" }}>
              {results.length} results
            </div>
            {results.map((r) => (
              <button
                key={r.node_id}
                onClick={() => handleSelectResult(r.node_id)}
                className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {r.name || r.node_id.split("/").pop()}
                  </span>
                  {r.category && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>
                      {r.category}
                    </span>
                  )}
                  {r.language && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>
                      {r.language}
                    </span>
                  )}
                </div>
                {r.description && (
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.description}</span>
                )}
                <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
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
