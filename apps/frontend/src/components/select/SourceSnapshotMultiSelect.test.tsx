import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourceSnapshotMultiSelect } from "./SourceSnapshotMultiSelect";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test" } }),
}));

const SOURCE_A = {
  id: "src-a",
  source_type: "github",
  owner: "alpha",
  name: "alpha-repo",
  url: "",
  default_branch: "main",
  config: {},
  meta: {},
  enabled: true,
  last_sync_id: "a-1",
  last_synced_at: null,
};
const SOURCE_B = {
  id: "src-b",
  source_type: "github",
  owner: "beta",
  name: "beta-repo",
  url: "",
  default_branch: "main",
  config: {},
  meta: {},
  enabled: true,
  last_sync_id: "b-1",
  last_synced_at: null,
};

vi.mock("@/hooks/useSources", () => ({
  useSources: () => ({
    sources: [SOURCE_A, SOURCE_B],
    isLoading: false,
    isPending: false,
    createSource: vi.fn(),
    purgeSource: vi.fn(),
    updateSource: vi.fn(),
  }),
}));

const SNAPSHOTS_BY_SOURCE: Record<string, Array<Record<string, unknown>>> = {
  "src-a": [
    {
      id: "a-1",
      source_id: "src-a",
      status: "completed",
      ref: "main@abcdef1",
      completed_at: "2026-04-25T10:34:00Z",
      created_at: "2026-04-25T10:30:00Z",
      progress_done: 0,
      progress_total: 0,
      progress_meta: null,
      stats: null,
      schedule_id: null,
      triggered_by: "user",
      started_at: null,
      resume_cursor: null,
      parent_sync_id: null,
    },
    {
      id: "a-2",
      source_id: "src-a",
      status: "completed",
      ref: "feature/x@1234567",
      completed_at: "2026-04-26T18:01:00Z",
      created_at: "2026-04-26T18:00:00Z",
      progress_done: 0,
      progress_total: 0,
      progress_meta: null,
      stats: null,
      schedule_id: null,
      triggered_by: "user",
      started_at: null,
      resume_cursor: null,
      parent_sync_id: null,
    },
  ],
  "src-b": [
    {
      id: "b-1",
      source_id: "src-b",
      status: "running",
      ref: "main@deadbee",
      completed_at: null,
      created_at: "2026-04-26T19:00:00Z",
      progress_done: 0,
      progress_total: 0,
      progress_meta: null,
      stats: null,
      schedule_id: null,
      triggered_by: "user",
      started_at: null,
      resume_cursor: null,
      parent_sync_id: null,
    },
  ],
};

vi.mock("@/hooks/useSourceSyncs", () => ({
  useSourceSyncs: (sourceId: string | null) => ({
    items: sourceId ? (SNAPSHOTS_BY_SOURCE[sourceId] ?? []) : [],
    isLoading: false,
    isFetching: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SourceSnapshotMultiSelect", () => {
  it("renders a row per source", () => {
    renderWithProviders(
      <SourceSnapshotMultiSelect value={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByText("alpha/alpha-repo")).toBeInTheDocument();
    expect(screen.getByText("beta/beta-repo")).toBeInTheDocument();
  });

  it("expanding a source reveals its snapshots", () => {
    renderWithProviders(
      <SourceSnapshotMultiSelect value={[]} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("alpha/alpha-repo"));
    expect(screen.getByText(/main @ abcdef1/)).toBeInTheDocument();
    expect(screen.getByText(/feature\/x @ 1234567/)).toBeInTheDocument();
  });

  it("clicking a snapshot toggles single id via onChange", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SourceSnapshotMultiSelect value={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText("alpha/alpha-repo"));
    const row = screen.getByText(/main @ abcdef1/).closest(
      ".snapshot-multiselect-snapshot",
    ) as HTMLElement;
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(["a-1"]);
  });

  it("clicking a source row toggles select-all-in-source", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SourceSnapshotMultiSelect value={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText("alpha/alpha-repo"));
    const sourceRow = screen
      .getByText("alpha/alpha-repo")
      .closest(".snapshot-multiselect-source-row") as HTMLElement;
    const sourceCheckbox = within(sourceRow).getAllByRole("checkbox")[0];
    fireEvent.click(sourceCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const ids = onChange.mock.calls[0][0] as string[];
    expect(new Set(ids)).toEqual(new Set(["a-1", "a-2"]));
  });

  it("source row checkbox is in 'partial' state when only some snapshots are selected", () => {
    renderWithProviders(
      <SourceSnapshotMultiSelect value={["a-1"]} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("alpha/alpha-repo"));
    const sourceRow = screen
      .getByText("alpha/alpha-repo")
      .closest(".snapshot-multiselect-source-row") as HTMLElement;
    const sourceCheckbox = within(sourceRow).getAllByRole("checkbox")[0];
    expect(sourceCheckbox).toHaveAttribute("aria-checked", "mixed");
  });

  it("disables non-completed snapshots when completedOnly is true", () => {
    renderWithProviders(
      <SourceSnapshotMultiSelect value={[]} onChange={vi.fn()} completedOnly />,
    );
    fireEvent.click(screen.getByText("beta/beta-repo"));
    // The lone snapshot for beta is 'running' → row gets is-disabled.
    const row = screen
      .getByText(/main @ deadbee/)
      .closest(".snapshot-multiselect-snapshot") as HTMLElement;
    expect(row.className).toMatch(/is-disabled/);
  });

  it("filters by sourceIds when provided", () => {
    renderWithProviders(
      <SourceSnapshotMultiSelect
        value={[]}
        onChange={vi.fn()}
        sourceIds={["src-b"]}
      />,
    );
    expect(screen.queryByText("alpha/alpha-repo")).toBeNull();
    expect(screen.getByText("beta/beta-repo")).toBeInTheDocument();
  });
});
