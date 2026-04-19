// frontend/src/components/panels/NodeDetailPanel.tsx
import { useEffect, useState } from "react";
import { Check, Copy, Download, FileText, RefreshCw, X } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { downloadJson } from "@/lib/download";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";

const REL_SYMBOL: Record<string, string> = {
  depends: "→", dependson: "→", imports: "↓", import: "↓",
  exports: "↑", export: "↑", contains: "⊂", has: "⊂",
  calls: "⟶", invokes: "⟶", inherits: "↟", extends: "↟",
  implements: "⊨", uses: "⟿", references: "@", refers: "@",
  defines: "≡", declares: "≡", owns: "§", related: "~",
};

function relSymbol(t: string): string {
  return REL_SYMBOL[String(t || "").toLowerCase().replace(/[_\s-]+/g, "")] || "◆";
}

interface NodeDetail {
  node: {
    id: string; name?: string; type?: string; domain?: string;
    language?: string; status?: string; description?: string;
    file_path?: string; size_bytes?: number | null; line_count?: number | null;
    sync_id?: string; content_hash?: string | null; created_at?: string;
  };
  neighbors: Array<{ id: string; type: string; weight: number }>;
}

function formatBytes(n?: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
  const setSourcesPageTarget = useUIStore((s) => s.setSourcesPageTarget);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const auth = useAuth();
  const token = auth.user?.access_token;
  const queryClient = useQueryClient();

  const cached = nodes.find((n) => n.id === selectedNodeId) as
    | (NodeDetail["node"] & {
        loaded_sync_ids?: string[];
        latest_sync_id?: string;
        divergent?: boolean;
        label?: string;
        source_id?: string;
      })
    | undefined;

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [fileOpen, setFileOpen] = useState(false);

  // Reset snapshot selection when node changes; default to latest_sync_id.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync dependent state on node change
    setSelectedSnapshotId(cached?.latest_sync_id ?? null);
  }, [selectedNodeId, cached?.latest_sync_id]);

  const visible = activeModal === "nodeDetail" && !!selectedNodeId;

  const detailQuery = useQuery<NodeDetail>({
    queryKey: ["node-detail", selectedNodeId, selectedSnapshotId],
    queryFn: () => {
      const sp = selectedSnapshotId ? `?sync_id=${selectedSnapshotId}` : "";
      return apiFetch<NodeDetail>(
        `/api/graph/nodes/${encodeURIComponent(String(selectedNodeId))}${sp}`, token);
    },
    enabled: visible && !!token,
    staleTime: 30_000,
  });

  const fileQuery = useQuery<{
    file_path: string; language: string; line_count?: number | null;
    size_bytes?: number | null; sync_id: string; last_commit_sha: string;
    chunk_count: number; content: string; truncated: boolean;
  }>({
    queryKey: ["node-file", selectedNodeId, selectedSnapshotId],
    queryFn: () => {
      const sp = selectedSnapshotId ? `?sync_id=${selectedSnapshotId}` : "";
      return apiFetch(
        `/api/graph/nodes/${encodeURIComponent(String(selectedNodeId))}/file${sp}`, token);
    },
    enabled: visible && fileOpen && !!token,
    staleTime: 60_000,
  });

  type SummaryResponse = {
    summary: string; cached: boolean;
    source: "cache" | "llm_enriched" | "no_content" | "llm_failed" | "not_found" | "not_generated";
    chunk_count?: number;
  };

  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: ["node-summary", selectedNodeId, selectedSnapshotId],
    queryFn: () => {
      const sp = selectedSnapshotId ? `?sync_id=${selectedSnapshotId}` : "";
      return apiFetch(
        `/api/graph/nodes/${encodeURIComponent(String(selectedNodeId))}/summary${sp}`, token);
    },
    enabled: visible && !!token,
    staleTime: 5 * 60_000,
  });

  const [regenerating, setRegenerating] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [fileCopied, setFileCopied] = useState(false);

  const flashCopy = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1400);
  };

  const copySummary = async () => {
    const text = summaryQuery.data?.summary;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashCopy(setSummaryCopied);
    } catch {
      // Clipboard can fail under insecure contexts or denied permissions;
      // swallow silently — the user can still use the Export button.
    }
  };

  const exportSummary = () => {
    if (!cached?.id) return;
    const allEdges = useGraphStore.getState().edges;
    const related = allEdges.filter(
      (e) => e.source === cached.id || e.target === cached.id,
    );
    // eslint-disable-next-line react-hooks/purity -- event handler; runs on click, not render
    downloadJson(`node-${cached.id}-summary-${Date.now()}.json`, {
      node: cached,
      summary: summaryQuery.data?.summary ?? null,
      summary_source: summaryQuery.data?.source ?? null,
      edges: related,
      snapshot_sync_id: selectedSnapshotId,
      exported_at: new Date().toISOString(),
    });
  };

  const copyFileContent = async () => {
    const text = fileQuery.data?.content;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashCopy(setFileCopied);
    } catch {
      // Same as summary copy — swallow clipboard failures.
    }
  };

  const regenerateSummary = async () => {
    if (!selectedNodeId || !token) return;
    const sp = selectedSnapshotId
      ? `?sync_id=${selectedSnapshotId}&force=true`
      : "?force=true";
    setRegenerating(true);
    try {
      const response = await apiFetch<SummaryResponse>(
        `/api/graph/nodes/${encodeURIComponent(selectedNodeId)}/summary${sp}`, token);
      // Seed the cache directly instead of invalidating — the response
      // is authoritative, and invalidating would trigger a second GET
      // that hits the just-written DB cache, wasting a round-trip.
      queryClient.setQueryData(
        ["node-summary", selectedNodeId, selectedSnapshotId],
        response,
      );
    } finally {
      setRegenerating(false);
    }
  };

  const handleExportNode = () => {
    if (!cached?.id) return;
    const allEdges = useGraphStore.getState().edges;
    const related = allEdges.filter(
      (e) => e.source === cached.id || e.target === cached.id,
    );
    // eslint-disable-next-line react-hooks/purity -- event handler; runs on click, not render
    downloadJson(`node-${cached.id}-${Date.now()}.json`, {
      node: cached,
      edges: related,
      exported_at: new Date().toISOString(),
    });
  };

  if (!visible) return null;

  const node = detailQuery.data?.node ?? cached;
  const neighbors = detailQuery.data?.neighbors ?? [];
  const loadedSyncIds = cached?.loaded_sync_ids ?? [];
  const latestSyncId = cached?.latest_sync_id;

  const close = () => {
    setSelectedNodeId(null);
    closeModal();
  };

  const openInSources = () => {
    if (!cached?.source_id || !selectedSnapshotId) return;
    setSourcesPageTarget({
      sourceId: cached.source_id as string,
      expandSyncId: selectedSnapshotId,
    });
    setActiveView("sources");
  };

  const title = (node as { label?: string; name?: string; id?: string } | undefined)?.label
    || node?.name || node?.id || "Node";

  return (
    <div className="node-detail-panel">
      <div className="node-detail-header">
        <h3 title={title}>{title}</h3>
        <Button onClick={close} title="Close"><X size={14} /></Button>
      </div>

      <div className="node-detail-body">
        {loadedSyncIds.length > 0 && (
          <section className="node-detail-section">
            <h4 className="node-detail-section-title">Snapshot</h4>
            <div className="node-detail-snapshot-picker">
              <select
                value={selectedSnapshotId ?? ""}
                onChange={(e) => setSelectedSnapshotId(e.target.value)}
              >
                {loadedSyncIds.map((id) => (
                  <option key={id} value={id}>
                    {id === latestSyncId ? "Latest — " : ""}{id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {cached?.divergent && (
                <span className="node-detail-divergent-badge"
                      title="Content differs across loaded snapshots">differs</span>
              )}
            </div>
            <Button
              onClick={openInSources}
              disabled={!cached?.source_id || !selectedSnapshotId}
              className="node-detail-open-in-sources"
            >
              Open in Sources
            </Button>
          </section>
        )}

        {detailQuery.isLoading && !cached && <div className="node-detail-muted">Loading…</div>}
        {detailQuery.isError && <div className="node-detail-muted">Failed to load details.</div>}

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
                {node.file_path && (
                  <Button
                    onClick={() => setFileOpen(true)}
                    disabled={!selectedSnapshotId}
                    className="node-detail-view-file"
                  >
                    <FileText size={12} /> View file
                  </Button>
                )}
              </section>
            )}

            <section className="node-detail-section">
              <div className="node-detail-section-header">
                <h4 className="node-detail-section-title">Summary</h4>
                <div className="node-detail-section-actions">
                  <button
                    type="button"
                    className="node-detail-regen-btn"
                    onClick={copySummary}
                    disabled={!summaryQuery.data?.summary}
                    title={summaryCopied ? "Copied" : "Copy summary"}
                    aria-label="Copy summary"
                  >
                    {summaryCopied ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                  <button
                    type="button"
                    className="node-detail-regen-btn"
                    onClick={exportSummary}
                    disabled={!cached}
                    title="Export summary + metadata + edges (JSON)"
                    aria-label="Export summary"
                  >
                    <Download size={11} />
                  </button>
                  <button
                    type="button"
                    className="node-detail-regen-btn"
                    onClick={regenerateSummary}
                    disabled={
                      regenerating ||
                      summaryQuery.isLoading ||
                      summaryQuery.data?.source === "no_content" ||
                      summaryQuery.data?.source === "not_found"
                    }
                    title={
                      summaryQuery.data?.source === "cache"
                        ? "Regenerate summary"
                        : "Generate summary"
                    }
                    aria-label="Regenerate summary"
                  >
                    <RefreshCw size={11} className={regenerating ? "spin" : undefined} />
                  </button>
                </div>
              </div>
              {summaryQuery.isLoading && (
                <div className="node-detail-muted">Loading…</div>
              )}
              {regenerating && (
                <div className="node-detail-muted">
                  Generating summary — this usually takes 30–90s on the local LLM…
                </div>
              )}
              {!regenerating && summaryQuery.data?.source === "not_generated" && (
                <div className="node-detail-muted">
                  Not generated yet. Click <RefreshCw size={10} /> to generate.
                </div>
              )}
              {!regenerating && summaryQuery.data?.source === "no_content" && (
                <div className="node-detail-muted">
                  No content has been indexed for this snapshot. Run a successful sync.
                </div>
              )}
              {!regenerating && summaryQuery.data?.source === "llm_failed" && (
                <div className="node-detail-muted">
                  Summary generation failed. Check LLM service and try again.
                </div>
              )}
              {!regenerating && summaryQuery.data?.summary && (
                <p className="node-detail-description">{summaryQuery.data.summary}</p>
              )}
            </section>

            <section className="node-detail-section">
              <h4 className="node-detail-section-title">Neighbors ({neighbors.length})</h4>
              <ul className="node-detail-neighbors">
                {neighbors.length === 0 ? (
                  <li className="node-detail-muted">No neighbors.</li>
                ) : neighbors.map((nb, i) => {
                  const neighborNode = nodes.find((n) => n.id === nb.id) as
                    | { name?: string; file_path?: string } | undefined;
                  const displayName = neighborNode?.name || neighborNode?.file_path || String(nb.id);
                  return (
                    <li key={`${nb.id}-${i}`} className="node-detail-neighbor">
                      <button
                        type="button"
                        className="node-detail-neighbor-btn"
                        onClick={() => setSelectedNodeId(nb.id)}
                        title={`${nb.type} — ${displayName}`}>
                        <span className="node-detail-neighbor-type" aria-label={nb.type}>
                          {relSymbol(nb.type)}
                        </span>
                        <span className="node-detail-neighbor-name">{displayName}</span>
                        {typeof nb.weight === "number" && (
                          <span className="node-detail-neighbor-weight">{nb.weight.toFixed(2)}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <section className="node-detail-section">
          <Button
            onClick={handleExportNode}
            className="node-detail-export-btn"
            disabled={!cached}
          >
            <FileText size={14} /> Export node + edges
          </Button>
        </section>
      </div>

      <Modal
        open={fileOpen}
        onClose={() => setFileOpen(false)}
        title={fileQuery.data?.file_path || node?.file_path || "File"}
        size="lg"
        contentClassName="node-file-modal"
      >
        {fileQuery.isLoading && <div className="node-detail-muted">Loading file…</div>}
        {fileQuery.isError && (
          <div className="node-detail-muted">Failed to load file content.</div>
        )}
        {fileQuery.data && (
          <>
            <div className="node-file-meta">
              {fileQuery.data.language && <span>{fileQuery.data.language}</span>}
              {fileQuery.data.line_count != null && (
                <span>{fileQuery.data.line_count} lines</span>
              )}
              {fileQuery.data.size_bytes != null && (
                <span>{formatBytes(fileQuery.data.size_bytes)}</span>
              )}
              <span>{fileQuery.data.chunk_count} chunks</span>
              {fileQuery.data.truncated && <span className="node-file-truncated">truncated at 5 MB</span>}
              <button
                type="button"
                className="node-file-copy-btn"
                onClick={copyFileContent}
                disabled={!fileQuery.data.content}
                title={fileCopied ? "Copied" : "Copy file content"}
                aria-label="Copy file content"
              >
                {fileCopied ? <Check size={12} /> : <Copy size={12} />}
                <span>{fileCopied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <pre className="node-file-content">
              <code>{fileQuery.data.content || "(empty)"}</code>
            </pre>
          </>
        )}
      </Modal>
    </div>
  );
}
