// frontend/src/hooks/useSyncs.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock react-oidc-context so the hook can resolve the token
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test-token" } }),
}));

// Mock stores that useSyncs pulls in
vi.mock("@/stores/graph", () => ({
  useGraphStore: (selector: (s: { setSyncStatus: (v: string) => void }) => unknown) =>
    selector({ setSyncStatus: vi.fn() }),
}));
vi.mock("@/stores/syncSet", () => ({
  useSyncSetStore: Object.assign(
    (selector: (s: { syncIds: string[]; sourceMap: Map<string,string> }) => unknown) =>
      selector({ syncIds: [], sourceMap: new Map() }),
    {
      getState: () => ({
        syncIds: [],
        sourceMap: new Map(),
        registerSourceMap: vi.fn(),
        onSyncCompleted: vi.fn(),
        pruneInvalid: vi.fn(),
      }),
    },
  ),
}));

import { useSyncs } from "./useSyncs";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSyncs — 202/409 mutation outcomes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns kind='created' on 202", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ sync_id: "fresh-sync-id", status: "pending" }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useSyncs(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.startSync).toBeDefined());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startSync({ source_id: "src-1" });
    });
    expect(outcome).toEqual({ kind: "created", sync_id: "fresh-sync-id" });
  });

  it("maps 409 sync_already_active to kind='already_active', no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "sync_already_active",
        message: "A sync is already running or pending for this source.",
        sync_id: "existing-sync-id",
        status: "already_active",
      }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useSyncs(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.startSync).toBeDefined());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startSync({ source_id: "src-1" });
    });
    expect(outcome).toEqual({ kind: "already_active", sync_id: "existing-sync-id" });
  });
});
