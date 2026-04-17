// frontend/src/components/sources/UnifiedToolbar.resync.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnifiedToolbar } from "./UnifiedToolbar";

const startSync = vi.fn().mockResolvedValue({ kind: "created", sync_id: "new-sync" });

vi.mock("@/hooks/useSyncs", () => ({
  useSyncs: () => ({
    startSync,
    cancelSync: vi.fn(),
    cleanSync: vi.fn(),
    purgeSync: vi.fn(),
    retrySync: vi.fn(),
    activeSyncs: [],
  }),
}));
vi.mock("@/hooks/useSources", () => ({
  useSources: () => ({ sources: [], purgeSource: vi.fn() }),
}));
vi.mock("@/hooks/useSchedules", () => ({
  useSchedules: () => ({ createSchedule: vi.fn() }),
}));
vi.mock("@/stores/syncSet", () => ({
  useSyncSetStore: (sel: (s: { syncIds: string[]; load: () => void; unload: () => void }) => unknown) =>
    sel({ syncIds: [], load: vi.fn(), unload: vi.fn() }),
}));

// Mock useSyncsByIds — the hook the toolbar uses to look up statuses by id.
vi.mock("@/hooks/useSyncsByIds", () => ({
  useSyncsByIds: (ids: string[]) => {
    const all = new Map([
      ["y1", { id: "y1", source_id: "s1", status: "completed" }],
      ["y2", { id: "y2", source_id: "s1", status: "failed" }],
      ["y3", { id: "y3", source_id: "s2", status: "completed" }],
      ["y4", { id: "y4", source_id: "s1", status: "running" }],
    ]);
    const syncsById = new Map(
      [...all.entries()].filter(([id]) => ids.includes(id))
    );
    return { syncsById };
  },
}));

const openModal = vi.fn();
vi.mock("@/stores/ui", () => ({
  useUIStore: (sel: (s: { openModal: typeof openModal }) => unknown) =>
    sel({ openModal }),
}));

const baseProps = {
  selectedSourceIds: new Set<string>(),
  selectedSyncIds: new Set<string>(),
  scheduleExpanded: false,
  onToggleSchedule: () => {},
  onSnapshotActionComplete: () => {},
  onSourceActionComplete: () => {},
};

describe("UnifiedToolbar Resync", () => {
  beforeEach(() => startSync.mockClear());

  it("is visible when all selected snapshots are completed or failed", () => {
    render(<UnifiedToolbar {...baseProps} selectedSyncIds={new Set(["y1", "y2"])} />);
    expect(screen.getByRole("button", { name: /resync/i })).toBeInTheDocument();
  });

  it("is hidden when any selected snapshot is running", () => {
    render(<UnifiedToolbar {...baseProps} selectedSyncIds={new Set(["y1", "y4"])} />);
    expect(screen.queryByRole("button", { name: /resync/i })).not.toBeInTheDocument();
  });

  it("dedupes by source_id and fires one startSync per unique source", async () => {
    render(<UnifiedToolbar {...baseProps} selectedSyncIds={new Set(["y1", "y2", "y3"])} />);
    fireEvent.click(screen.getByRole("button", { name: /resync/i }));
    await new Promise((r) => setTimeout(r, 0));
    const calls = startSync.mock.calls.map((c: [{ source_id: string }]) => c[0].source_id).sort();
    expect(calls).toEqual(["s1", "s2"]);
  });
});

describe("UnifiedToolbar Enrich", () => {
  beforeEach(() => openModal.mockClear());

  it("shows Enrich button when exactly one source is selected", () => {
    render(
      <UnifiedToolbar
        {...baseProps}
        selectedSourceIds={new Set(["src-1"])}
      />
    );
    expect(screen.getByRole("button", { name: /enrich/i })).toBeInTheDocument();
  });

  it("hides Enrich button when multiple sources are selected", () => {
    render(
      <UnifiedToolbar
        {...baseProps}
        selectedSourceIds={new Set(["src-1", "src-2"])}
      />
    );
    expect(screen.queryByRole("button", { name: /^enrich$/i })).toBeNull();
  });

  it("opens the enrichment modal on click", () => {
    render(
      <UnifiedToolbar
        {...baseProps}
        selectedSourceIds={new Set(["src-1"])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /enrich/i }));
    expect(openModal).toHaveBeenCalledWith("enrichment");
  });
});
