// frontend/src/components/sources/CurrentlyRenderedRail.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrentlyRenderedRail } from "./CurrentlyRenderedRail";
import { useSyncSetStore } from "@/stores/syncSet";
import { useUIStore } from "@/stores/ui";

// Mock useSources — sources have owner + name (not a single name field).
vi.mock("@/hooks/useSources", () => ({
  useSources: () => ({
    sources: [
      { id: "s1", owner: "acme", name: "repo" },
      { id: "s2", owner: "foo", name: "svc" },
    ],
  }),
}));

// Mock react-oidc-context (required by useLoadedSyncs which calls useAuth).
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test-token" } }),
}));

// Mock useLoadedSyncs — the hook that fetches individual sync details.
vi.mock("@/hooks/useLoadedSyncs", () => ({
  useLoadedSyncs: (syncIds: string[]) => {
    const allSyncs: Record<string, {
      id: string;
      source_id: string;
      completed_at: string | null;
      stats: { node_count: number } | null;
    }> = {
      y1: {
        id: "y1",
        source_id: "s1",
        completed_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        stats: { node_count: 1234 },
      },
      y2: {
        id: "y2",
        source_id: "s2",
        completed_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        stats: { node_count: 340 },
      },
    };
    return syncIds.map((id) => allSyncs[id] ?? null).filter(Boolean);
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CurrentlyRenderedRail", () => {
  beforeEach(() => {
    useSyncSetStore.setState({ syncIds: [], sourceMap: new Map() });
    useUIStore.setState({ sourcesPageTarget: null });
  });

  it("shows empty state when no syncs loaded", () => {
    renderWithClient(<CurrentlyRenderedRail />);
    expect(screen.getByText(/nothing loaded/i)).toBeInTheDocument();
  });

  it("renders one row per loaded sync with label + timestamp + node count", () => {
    useSyncSetStore.setState({
      syncIds: ["y1", "y2"],
      sourceMap: new Map([["y1", "s1"], ["y2", "s2"]]),
    });
    renderWithClient(<CurrentlyRenderedRail />);
    expect(screen.getByText("acme/repo")).toBeInTheDocument();
    expect(screen.getByText("foo/svc")).toBeInTheDocument();
    // 1234 nodes -> "1.2k nodes"
    expect(screen.getByText(/1\.2k nodes/)).toBeInTheDocument();
  });

  it("row click sets sourcesPageTarget", () => {
    useSyncSetStore.setState({
      syncIds: ["y1"],
      sourceMap: new Map([["y1", "s1"]]),
    });
    renderWithClient(<CurrentlyRenderedRail />);
    const row = screen.getByText("acme/repo").closest("[data-role='rail-row']");
    if (!row) throw new Error("rail row not rendered");
    fireEvent.click(row);
    expect(useUIStore.getState().sourcesPageTarget).toEqual({ sourceId: "s1", expandSyncId: "y1" });
  });

  it("unload button click triggers unload and stops propagation", () => {
    useSyncSetStore.setState({
      syncIds: ["y1"],
      sourceMap: new Map([["y1", "s1"]]),
    });
    const unloadSpy = vi.fn();
    useSyncSetStore.setState({ unload: unloadSpy });
    renderWithClient(<CurrentlyRenderedRail />);
    fireEvent.click(screen.getByLabelText("Unload acme/repo"));
    expect(unloadSpy).toHaveBeenCalledWith("y1");
    // Row click must NOT have fired — target remains null.
    expect(useUIStore.getState().sourcesPageTarget).toBeNull();
  });
});
