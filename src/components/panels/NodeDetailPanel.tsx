import { RefreshCw, X } from "lucide-react";
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

  // LLM-generated summary. The graph service caches it in the description
  // column, so subsequent opens are cheap.
  const summaryQuery = useQuery<{ summary: string; cached: boolean; source: string }>({
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
                  disabled={summaryQuery.isFetching}
                  title="Regenerate summary"
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
              {summaryQuery.data?.summary && (
                <p className="node-detail-description">{summaryQuery.data.summary}</p>
              )}
              {!summaryQuery.isLoading &&
                !summaryQuery.isError &&
                !summaryQuery.data?.summary &&
                node.description && (
                  <p className="node-detail-description">{node.description}</p>
                )}
            </section>

            {(node.first_seen || node.last_seen) && (
              <section className="node-detail-section">
                <h4 className="node-detail-section-title">Timeline</h4>
                {node.first_seen && <Row label="First seen" value={formatTs(node.first_seen)} />}
                {node.last_seen && <Row label="Last seen" value={formatTs(node.last_seen)} />}
              </section>
            )}

            {neighbors.length > 0 && (
              <section className="node-detail-section">
                <h4 className="node-detail-section-title">
                  Neighbors ({neighbors.length})
                </h4>
                <ul className="node-detail-neighbors">
                  {neighbors.slice(0, 40).map((nb, i) => (
                    <li key={`${nb.id}-${i}`} className="node-detail-neighbor">
                      <button
                        type="button"
                        className="node-detail-neighbor-btn"
                        onClick={() => setSelectedNodeId(nb.id)}
                        title={`Jump to ${nb.id}`}
                      >
                        <span className="node-detail-neighbor-type">{nb.type}</span>
                        <code className="node-detail-neighbor-id">{nb.id}</code>
                        {typeof nb.weight === "number" && (
                          <span className="node-detail-neighbor-weight">
                            {nb.weight.toFixed(2)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {neighbors.length > 40 && (
                    <li className="node-detail-muted">
                      …and {neighbors.length - 40} more
                    </li>
                  )}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
