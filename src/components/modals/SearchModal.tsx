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
      <div className="flex flex-col gap-5">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search nodes semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 text-[12px] px-4 py-3 outline-none"
            style={{
              background: "var(--bg-surface)", boxShadow: "var(--neu-inset)",
              borderRadius: "var(--radius-lg)", color: "var(--text-primary)", border: "none",
            }}
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            className="flex items-center gap-1.5 px-5 py-3 text-[12px] font-semibold"
            style={{
              background: "var(--accent)", borderRadius: "var(--radius-lg)",
              color: "#fff", boxShadow: "var(--neu-extruded-sm)",
              opacity: !query.trim() || searching ? 0.4 : 1,
              transition: "all 0.3s ease-out",
            }}
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Filter by category..."
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 text-[11px] px-3 py-2.5 outline-none"
            style={{
              background: "var(--bg-surface)", boxShadow: "var(--neu-inset-sm)",
              borderRadius: "var(--radius-md)", color: "var(--text-secondary)", border: "none",
            }}
          />
          <input
            type="text"
            placeholder="Filter by domain..."
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="flex-1 text-[11px] px-3 py-2.5 outline-none"
            style={{
              background: "var(--bg-surface)", boxShadow: "var(--neu-inset-sm)",
              borderRadius: "var(--radius-md)", color: "var(--text-secondary)", border: "none",
            }}
          />
        </div>

        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
              {results.length} results
            </div>
            {results.map((r) => (
              <button
                key={r.node_id}
                onClick={() => handleSelectResult(r.node_id)}
                className="neu-btn flex flex-col gap-1 px-4 py-3.5 text-left"
                style={{
                  background: "var(--bg-surface)", borderRadius: "var(--radius-lg)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                    {r.name || r.node_id.split("/").pop()}
                  </span>
                  {r.category && (
                    <span className="text-[9px] px-2 py-0.5" style={{
                      background: "var(--accent-soft)", color: "var(--accent-text)",
                      borderRadius: "var(--radius-sm)", fontWeight: 600,
                    }}>
                      {r.category}
                    </span>
                  )}
                  {r.language && (
                    <span className="text-[9px] px-2 py-0.5" style={{
                      background: "var(--bg-hover)", color: "var(--text-muted)",
                      borderRadius: "var(--radius-sm)",
                    }}>
                      {r.language}
                    </span>
                  )}
                </div>
                {r.description && (
                  <span className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{r.description}</span>
                )}
                <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
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
