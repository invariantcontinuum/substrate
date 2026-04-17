// frontend/src/components/sources/SnapshotRow.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnapshotRow } from "./SnapshotRow";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test-token" } }),
}));
vi.mock("@/hooks/useSyncs", () => ({
  useSyncs: () => ({ retrySync: vi.fn() }),
}));
vi.mock("@/hooks/useSyncIssues", () => ({
  useSyncIssues: () => ({ issues: [], isLoading: false }),
}));

function makeRun(overrides = {}) {
  return {
    id: "aaaaaaaa-1111-2222-3333-444444444444",
    source_id: "s1", status: "failed", ref: null,
    progress_done: 0, progress_total: 0, progress_meta: null, stats: null,
    triggered_by: "user", started_at: null,
    completed_at: "2026-04-15T07:00:00Z", created_at: "2026-04-15T07:00:00Z",
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SnapshotRow", () => {
  it("toggles expansion on row click", () => {
    const onToggleExpand = vi.fn();
    renderWithClient(
      <SnapshotRow
        run={makeRun() as any}
        isSelected={false}
        isExpanded={false}
        onToggleSelect={() => {}}
        onToggleExpand={onToggleExpand}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /failed/i }));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it("renders issues inline when expanded", () => {
    renderWithClient(
      <SnapshotRow
        run={makeRun() as any}
        isSelected={false}
        isExpanded={true}
        onToggleSelect={() => {}}
        onToggleExpand={() => {}}
      />
    );
    expect(screen.getByText(/Retry/i)).toBeInTheDocument();
  });

  it("shows file-count readout for a running sync", () => {
    renderWithClient(
      <SnapshotRow
        run={makeRun({
          status: "running",
          progress_done: 42,
          progress_total: 120,
          progress_meta: { phase: "parsing" },
        }) as any}
        isSelected={false}
        isExpanded={false}
        onToggleSelect={() => {}}
        onToggleExpand={() => {}}
      />
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
        }) as any}
        isSelected={false}
        isExpanded={false}
        onToggleSelect={() => {}}
        onToggleExpand={() => {}}
      />
    );
    expect(screen.getByText(/120 \/ 120/)).toBeInTheDocument();
  });
});
