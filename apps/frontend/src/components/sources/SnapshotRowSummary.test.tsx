import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnapshotRowSummary } from "./SnapshotRowSummary";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test" } }),
}));

const resyncMutate = vi.fn();
vi.mock("@/hooks/useResyncSnapshot", () => ({
  useResyncSnapshot: () => ({ mutate: resyncMutate, isPending: false }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

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
    renderWithProviders(
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
    renderWithProviders(
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
    const { container } = renderWithProviders(
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

describe("SnapshotRowSummary resync icon", () => {
  const RESUMABLE_CURSOR = {
    pinned_commit: "abc123",
    completed_files: ["a.py", "b.py"],
  };

  it("hides resync button on completed runs (cursor irrelevant)", () => {
    const { container } = renderWithProviders(
      <SnapshotRowSummary
        run={
          {
            ...BASE_RUN,
            status: "completed",
            resume_cursor: RESUMABLE_CURSOR,
          } as never
        }
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.querySelector(".snapshot-row-resync")).toBeNull();
  });

  it("hides resync button on failed runs without resume_cursor", () => {
    const { container } = renderWithProviders(
      <SnapshotRowSummary
        run={
          { ...BASE_RUN, status: "failed", resume_cursor: null } as never
        }
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.querySelector(".snapshot-row-resync")).toBeNull();
  });

  it("shows resync button on failed runs with resume_cursor", () => {
    const { container } = renderWithProviders(
      <SnapshotRowSummary
        run={
          {
            ...BASE_RUN,
            status: "failed",
            resume_cursor: RESUMABLE_CURSOR,
          } as never
        }
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.querySelector(".snapshot-row-resync")).not.toBeNull();
  });

  it("shows resync button on cancelled runs with resume_cursor", () => {
    const { container } = renderWithProviders(
      <SnapshotRowSummary
        run={
          {
            ...BASE_RUN,
            status: "cancelled",
            resume_cursor: RESUMABLE_CURSOR,
          } as never
        }
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.querySelector(".snapshot-row-resync")).not.toBeNull();
  });

  it("clicking resync fires mutate with sync id and does not toggle expand", () => {
    resyncMutate.mockClear();
    const onToggleExpand = vi.fn();
    const { container } = renderWithProviders(
      <SnapshotRowSummary
        run={
          {
            ...BASE_RUN,
            status: "failed",
            resume_cursor: RESUMABLE_CURSOR,
          } as never
        }
        isExpanded={false}
        onToggleExpand={onToggleExpand}
      />,
    );
    const btn = container.querySelector(".snapshot-row-resync");
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(resyncMutate).toHaveBeenCalledWith(BASE_RUN.id);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});
