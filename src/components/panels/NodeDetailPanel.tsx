import { RefreshCw, X } from "lucide-react";

// Short glyphs for AGE edge types. Keyed on lowercase, underscores and
// hyphens stripped, so DEPENDS_ON / depends-on / DependsOn all hit the
// same entry. Falls back to a small diamond if the type is unknown.
const REL_SYMBOL: Record<string, string> = {
  depends: "→",
  dependson: "→",
  imports: "↓",
  import: "↓",
  exports: "↑",
  export: "↑",
  contains: "⊂",
  has: "⊂",
  calls: "⟶",
  invokes: "⟶",
  inherits: "↟",
  extends: "↟",
  implements: "⊨",
  uses: "⟿",
  references: "@",
  refers: "@",
  defines: "≡",
  declares: "≡",
  owns: "§",
  related: "~",
};

function relSymbol(type: string): string {
  const key = String(type || "").toLowerCase().replace(/[_\s-]+/g, "");
  return REL_SYMBOL[key] || "◆";
}
import { useAuth } from "react-oidc-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";

// Shape returned by GET /api/graph/nodes/{id} — see services/graph/src/graph/store.py.
interface NodeDetail {
  node: {
    id: string;
    name?: string;
    type?: string;
    domain?: string;
    language?: string;
    status?: string;
    description?: string;
    file_path?: string;
    size_bytes?: number | null;
    line_count?: number | null;
    first_seen?: string;
    last_seen?: string;
  };
  neighbors: Array<{ id: string; type: string; weight: number }>;
}

function formatBytes(n?: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTs(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="node-detail-row">
      <span className="node-detail-label">{label}</span>
      {mono ? <code>{value}</code> : <span className="node-detail-value">{value}</span>}
    </div>
  );
}

export function NodeDetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const auth = useAuth();
  const token = auth.user?.access_token;

  const visible = activeModal === "nodeDetail" && !!selectedNodeId;

  // Seed from the snapshot while the detail endpoint is fetching.
  const cached = nodes.find((n) => n.id === selectedNodeId) as
    | (NodeDetail["node"] & { label?: string })
    | undefined;

  const queryClient = useQueryClient();

  const detailQuery = useQuery<NodeDetail>({
    queryKey: ["node-detail", selectedNodeId],
    queryFn: () =>
      apiFetch<NodeDetail>(
        `/api/graph/nodes/${encodeURIComponent(String(selectedNodeId))}`,
        token
      ),
    enabled: visible && !!token,
    staleTime: 30_000,
  });

  // LLM-generated summary. The graph service only calls the LLM when there
  // are indexed chunks — otherwise it returns source="no_content" and we
  // render an honest placeholder rather than confabulated prose.
  const summaryQuery = useQuery<{
    summary: string;
    cached: boolean;
    source: "cache" | "llm" | "no_content" | "llm_failed" | "not_found";
    chunk_count?: number;
  }>({
    queryKey: ["node-summary", selectedNodeId],
    queryFn: () =>
      apiFetch(
        `/api/graph/nodes/${encodeURIComponent(String(selectedNodeId))}/summary`,
        token
      ),
    enabled: visible && !!token,
    staleTime: 5 * 60_000,
  });

  const regenerateSummary = async () => {
    if (!selectedNodeId || !token) return;
    await apiFetch(
      `/api/graph/nodes/${encodeURIComponent(selectedNodeId)}/summary?force=true`,
      token
    );
    await queryClient.invalidateQueries({ queryKey: ["node-summary", selectedNodeId] });
  };

  if (!visible) return null;

  const node = detailQuery.data?.node ?? cached;
  const neighbors = detailQuery.data?.neighbors ?? [];

  const close = () => {
    setSelectedNodeId(null);
    closeModal();
  };

  const title = (node as any)?.label || node?.name || node?.id || "Node";

  return (
    <div className="node-detail-panel">
      <div className="node-detail-header">
        <h3 title={title}>{title}</h3>
        <Button onClick={close} title="Close"><X size={14} /></Button>
      </div>

      <div className="node-detail-body">
        {detailQuery.isLoading && !cached && (
          <div className="node-detail-muted">Loading…</div>
        )}
        {detailQuery.isError && (
          <div className="node-detail-muted">Failed to load details.</div>
        )}

        {node && (
          <>
            <section className="node-detail-section">
              <h4 className="node-detail-section-title">Identity</h4>
              <Row label="ID" value={String(node.id)} mono />
              {node.name && <Row label="Name" value={node.name} />}
              {node.type && <Row label="Type" value={node.type} />}
              {node.domain && <Row label="Domain" value={node.domain} />}
              {node.language && <Row label="Language" value={node.language} />}
              {node.status && <Row label="Status" value={node.status} />}
            </section>

            {(node.file_path || node.size_bytes != null || node.line_count != null) && (
              <section className="node-detail-section">
                <h4 className="node-detail-section-title">File</h4>
                {node.file_path && <Row label="Path" value={node.file_path} mono />}
                {node.size_bytes != null && (
                  <Row label="Size" value={formatBytes(node.size_bytes)} />
                )}
                {node.line_count != null && (
                  <Row label="Lines" value={String(node.line_count)} />
                )}
              </section>
            )}

            <section className="node-detail-section">
              <div className="node-detail-section-header">
                <h4 className="node-detail-section-title">Summary</h4>
                <button
                  type="button"
                  className="node-detail-regen-btn"
                  onClick={regenerateSummary}
                  disabled={
                    summaryQuery.isFetching ||
                    summaryQuery.data?.source === "no_content"
                  }
                  title={
                    summaryQuery.data?.source === "no_content"
                      ? "Needs ingested content before a summary can be generated"
                      : "Regenerate summary"
                  }
                >
                  <RefreshCw size={11} />
                </button>
              </div>
              {summaryQuery.isLoading && (
                <div className="node-detail-muted">Generating summary…</div>
              )}
              {summaryQuery.isError && (
                <div className="node-detail-muted">Summary unavailable.</div>
              )}
              {summaryQuery.data?.source === "no_content" && (
                <div className="node-detail-muted">
                  No content has been indexed for this file yet. Run a
                  successful sync so the ingestion service can write
                  <code> content_chunks</code>, then regenerate.
                </div>
              )}
              {summaryQuery.data?.source === "llm_failed" && (
                <div className="node-detail-muted">
                  Summary model unavailable. Try again once the dense LLM
                  service is reachable.
                </div>
              )}
              {summaryQuery.data?.summary &&
                summaryQuery.data.source !== "no_content" && (
                  <p className="node-detail-description">
                    {summaryQuery.data.summary}
                  </p>
                )}
            </section>

            {(node.first_seen || node.last_seen) && (
              <section className="node-detail-section">
                <h4 className="node-detail-section-title">Timeline</h4>
                {node.first_seen && <Row label="First seen" value={formatTs(node.first_seen)} />}
                {node.last_seen && <Row label="Last seen" value={formatTs(node.last_seen)} />}
              </section>
            )}

            <section className="node-detail-section">
              <h4 className="node-detail-section-title">
                Neighbors ({neighbors.length})
              </h4>
              <ul className="node-detail-neighbors">
                {neighbors.length === 0 ? (
                  <li className="node-detail-muted">No neighbors.</li>
                ) : (
                  neighbors.map((nb, i) => {
                    const neighborNode = nodes.find((n) => n.id === nb.id) as
                      | { name?: string; file_path?: string }
                      | undefined;
                    const displayName =
                      neighborNode?.name ||
                      neighborNode?.file_path ||
                      String(nb.id);
                    return (
                      <li key={`${nb.id}-${i}`} className="node-detail-neighbor">
                        <button
                          type="button"
                          className="node-detail-neighbor-btn"
                          onClick={() => setSelectedNodeId(nb.id)}
                          title={`${nb.type} — ${displayName}`}
                        >
                          <span
                            className="node-detail-neighbor-type"
                            aria-label={nb.type}
                          >
                            {relSymbol(nb.type)}
                          </span>
                          <span className="node-detail-neighbor-name">
                            {displayName}
                          </span>
                          {typeof nb.weight === "number" && (
                            <span className="node-detail-neighbor-weight">
                              {nb.weight.toFixed(2)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
