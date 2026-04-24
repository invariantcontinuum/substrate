import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnapshotRowSummary } from "./SnapshotRowSummary";

const BASE_RUN = {
  id: "r1",
  source_id: "s1",
  status: "completed" as const,
  completed_at: "2026-04-23T12:00:00Z",
  created_at: "2026-04-23T11:55:00Z",
  ref: null,
  progress_done: 0,
  progress_total: 0,
  progress_meta: null as never,
  stats: {
    counts: { node_count: 12430, edge_count: 38102 },
    leiden: { count: 14, modularity: 0.617, community_sizes: [2214, 1402, 1118, 945, 820, 612] },
    timing: { total_ms: 443471, phase_ms: {} },
    schema_version: 1,
  },
  schedule_id: null,
  triggered_by: "user",
  started_at: null,
};

describe("SnapshotRowSummary V3", () => {
  it("renders node, edge, community, modularity pills", () => {
    render(
      <SnapshotRowSummary
        run={BASE_RUN as never}
        isSelected={false}
        isExpanded={false}
        onToggleSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByText(/12,430/)).toBeInTheDocument();
    expect(screen.getByText(/38,102/)).toBeInTheDocument();
    expect(screen.getByText(/14/)).toBeInTheDocument();
    expect(screen.getByText(/0.62/)).toBeInTheDocument();
  });

  it("shows 'stats unavailable' when schema_version is 0", () => {
    const r = { ...BASE_RUN, stats: { schema_version: 0 } };
    render(
      <SnapshotRowSummary
        run={r as never}
        isSelected={false}
        isExpanded={false}
        onToggleSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("sparkline renders 6 bars for 6 community sizes", () => {
    const { container } = render(
      <SnapshotRowSummary
        run={BASE_RUN as never}
        isSelected={false}
        isExpanded={false}
        onToggleSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".sparkline-bar").length).toBe(6);
  });
});
