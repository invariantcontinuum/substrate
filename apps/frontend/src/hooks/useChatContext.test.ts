import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { useApplyChatContext } from "./useChatContext";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test" } }),
}));

vi.mock("./useAuthToken", () => ({
  useAuthToken: () => "test-token",
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (
    path: string,
    token: string | undefined,
    options?: RequestInit,
  ) => fetchMock(path, token, options),
}));

vi.mock("@/stores/chatContext", () => ({
  useChatContextStore: Object.assign(
    (selector: (s: { setActive: ReturnType<typeof vi.fn> }) => unknown) =>
      selector({ setActive: vi.fn() }),
    { getState: () => ({ setActive: vi.fn() }) },
  ),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ active: null });
});

describe("useApplyChatContext", () => {
  it("sends JSON.stringify(next) for a non-null value", async () => {
    const { result } = renderHook(() => useApplyChatContext(), { wrapper });
    const payload = { source_ids: ["s-1"], sync_ids: [] };
    act(() => {
      result.current.mutate(payload);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat-context/active",
      "test-token",
      expect.objectContaining({ body: JSON.stringify(payload) }),
    );
  });

  it("sends the string 'null' (valid JSON) for the clear path, not an empty string", async () => {
    const { result } = renderHook(() => useApplyChatContext(), { wrapper });
    act(() => {
      result.current.mutate(null);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat-context/active",
      "test-token",
      expect.objectContaining({ body: "null" }),
    );
    // Guard: ensure the body is NOT the broken empty-string form.
    const calledOptions = fetchMock.mock.calls[0][2] as RequestInit;
    expect(calledOptions.body).not.toBe("");
  });
});
