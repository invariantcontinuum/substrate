// frontend/src/components/sources/SnapshotRow.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnapshotRow } from "./SnapshotRow";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test-token" } }),
}));
vi.mock("@/hooks/useSyncIssues", () => ({
  useSyncIssues: () => ({ issues: [], isLoading: false }),
}));
vi.mock("@/hooks/useResyncSnapshot", () => ({
  useResyncSnapshot: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useExportSnapshot", () => ({
  useExportSnapshot: () => vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/useSyncs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useSyncs")>(
    "@/hooks/useSyncs",
  );
  return {
    ...actual,
    useSyncs: () => ({
      activeSyncs: [],
      startSync: vi.fn(),
      cancelSync: vi.fn(),
      cleanSync: vi.fn(),
      purgeSync: vi.fn(),
    }),
  };
});

function makeRun(overrides = {}) {
  return {
    id: "aaaaaaaa-1111-2222-3333-444444444444",
    source_id: "s1", status: "failed", ref: null,
    progress_done: 0, progress_total: 0, progress_meta: null, stats: null,
    triggered_by: "user", started_at: null,
    completed_at: "2026-04-15T07:00:00Z", created_at: "2026-04-15T07:00:00Z",
    resume_cursor: null,
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SnapshotRow", () => {
  it("toggles expansion when the row body is clicked", () => {
    const onToggleExpand = vi.fn();
    const { container } = renderWithClient(
      <SnapshotRow
        run={makeRun() as never}
        isExpanded={false}
        onToggleExpand={onToggleExpand}
      />,
    );
    const row = container.querySelector(".snapshot-row");
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("renders stats panel when expanded", () => {
    renderWithClient(
      <SnapshotRow
        run={makeRun({
          status: "completed",
          started_at: "2026-04-15T06:55:00Z",
          completed_at: "2026-04-15T07:00:00Z",
          stats: {
            schema_version: 1,
            counts: { node_count: 12480, edge_count: 34209, files_indexed: 3240 },
            timing: { total_ms: 300000, phase_ms: {} },
          },
        }) as never}
        isExpanded={true}
        onToggleExpand={() => {}}
      />,
    );
    expect(screen.getByText(/12,480/)).toBeInTheDocument();
    expect(screen.getByText(/34,209/)).toBeInTheDocument();
    expect(screen.getByText(/3,240/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("shows file-count readout for a running sync", () => {
    renderWithClient(
      <SnapshotRow
        run={makeRun({
          status: "running",
          progress_done: 42,
          progress_total: 120,
          progress_meta: { phase: "parsing" },
        }) as never}
        isExpanded={false}
        onToggleExpand={() => {}}
      />,
    );
    expect(screen.getByText(/42 \/ 120/)).toBeInTheDocument();
  });

  it("shows file-count readout during embedding phases too", () => {
    renderWithClient(
      <SnapshotRow
        run={makeRun({
          status: "running",
          progress_done: 120,
          progress_total: 120,
          progress_meta: { phase: "embedding_chunks" },
        }) as never}
        isExpanded={false}
        onToggleExpand={() => {}}
      />,
    );
    expect(screen.getByText(/120 \/ 120/)).toBeInTheDocument();
  });
});
