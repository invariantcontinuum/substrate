import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnapshotExpandedDrawer } from "./SnapshotExpandedDrawer";

const RUN = {
  id: "r1", source_id: "s1", status: "completed" as const,
  ref: null, progress_done: 0, progress_total: 0, progress_meta: null,
  schedule_id: null, triggered_by: "user", started_at: null, completed_at: "2026-04-23T12:00:00Z", created_at: "2026-04-23T11:55:00Z",
  stats: {
    counts: { node_count: 10, edge_count: 20, by_type: { file: 5, symbol: 5 },
              by_relation: { imports: 15, contains: 5 },
              files_indexed: 5, files_skipped: 1, files_denied: 0 },
    storage: { graph_bytes: 1024, embedding_bytes: 8192 },
    embeddings: { chunks: 4, file_summaries: 2 },
    timing: { phase_ms: { cloning: 100, parsing: 200, graphing: 300 }, total_ms: 600 },
    leiden: { count: 2, modularity: 0.5, largest_share: 0.6, orphan_pct: 0.1,
              community_sizes: [6, 4], config_used: { resolution: 1.0, beta: 0.01, iterations: 10, min_cluster_size: 4, seed: 42 } },
    issues: { error_count: 0, warning_count: 2, info_count: 1 },
    schema_version: 1,
  },
};

describe("SnapshotExpandedDrawer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, json: async () => ({ prior_sync_id: null, prior_completed_at: null, delta: null }),
    })));
    (window as never as { __authToken?: string }).__authToken = "tok";
  });

  it("renders all 5 non-delta sections", () => {
    render(<SnapshotExpandedDrawer run={RUN as never} />);
    expect(screen.getByText(/Counts & breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Communities/i)).toBeInTheDocument();
    expect(screen.getByText(/Storage/i)).toBeInTheDocument();
    expect(screen.getByText(/Timing/i)).toBeInTheDocument();
    expect(screen.getByText(/Issues/i)).toBeInTheDocument();
  });

  it("renders delta section with 'no prior snapshot' when null", async () => {
    render(<SnapshotExpandedDrawer run={RUN as never} />);
    expect(await screen.findByText(/no prior snapshot/i)).toBeInTheDocument();
  });
});
