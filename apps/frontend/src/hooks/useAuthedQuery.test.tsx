import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAuthedQuery } from "./useAuthedQuery";

const tokenMock = vi.fn(() => "test-token");
vi.mock("./useAuthToken", () => ({
  useAuthToken: () => tokenMock(),
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (path: string, token: string | undefined) => fetchMock(path, token),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchMock.mockReset();
  tokenMock.mockReturnValue("test-token");
});

describe("useAuthedQuery", () => {
  it("calls apiFetch with the path and token, returns data", async () => {
    fetchMock.mockResolvedValue({ items: [1, 2, 3] });
    const { result } = renderHook(
      () => useAuthedQuery<{ items: number[] }>(["test"], "/api/x"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/x", "test-token");
    expect(result.current.data?.items).toEqual([1, 2, 3]);
  });

  it("is disabled when no auth token is available (never fires apiFetch)", async () => {
    tokenMock.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(
      () => useAuthedQuery<{ ok: boolean }>(["test"], "/api/x"),
      { wrapper },
    );
    // Give react-query a beat to react.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it("ANDs caller-supplied enabled with !!token", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(
      () => useAuthedQuery<{ ok: boolean }>(["test"], "/api/x", { enabled: false }),
      { wrapper },
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });
});
