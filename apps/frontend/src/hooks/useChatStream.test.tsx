import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useChatStream } from "./useChatStream";
import { useChatStore } from "@/stores/chat";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test" } }),
}));

const handlers: Record<string, ((ev: unknown) => void)[]> = {};
const mockClose = vi.fn();
vi.mock("@/lib/sse", () => ({
  openSseClient: () => ({
    on: (type: string, h: (ev: unknown) => void) => {
      (handlers[type] ||= []).push(h);
    },
    close: mockClose,
    lastEventId: () => "",
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  mockClose.mockClear();
  useChatStore.setState({ streamingTurn: null });
});

function fire(type: string, payload: unknown) {
  for (const h of handlers[type] ?? []) {
    h({ id: "e1", type, payload, emitted_at: "" });
  }
}

describe("useChatStream", () => {
  it("seeds streamingTurn on chat.turn.started, appends on chunk, clears on completed", () => {
    renderHook(() => useChatStream("t1"), { wrapper });

    act(() => fire("chat.turn.started", { thread_id: "t1", message_id: "m1", role: "assistant" }));
    expect(useChatStore.getState().streamingTurn).toEqual({
      threadId: "t1", messageId: "m1", content: "",
    });

    act(() => fire("chat.turn.chunk", { thread_id: "t1", message_id: "m1", delta: "Hello " }));
    act(() => fire("chat.turn.chunk", { thread_id: "t1", message_id: "m1", delta: "world" }));
    expect(useChatStore.getState().streamingTurn?.content).toBe("Hello world");

    act(() => fire("chat.turn.completed", {
      thread_id: "t1", message_id: "m1", content: "Hello world", citations: [],
    }));
    expect(useChatStore.getState().streamingTurn).toBeNull();
  });

  it("ignores events for other threads", () => {
    renderHook(() => useChatStream("t1"), { wrapper });
    act(() => fire("chat.turn.started", { thread_id: "t2", message_id: "m1", role: "assistant" }));
    expect(useChatStore.getState().streamingTurn).toBeNull();
  });

  it("clears streamingTurn on chat.turn.failed", () => {
    renderHook(() => useChatStream("t1"), { wrapper });
    act(() => fire("chat.turn.started", { thread_id: "t1", message_id: "m1" }));
    act(() => fire("chat.turn.failed", { thread_id: "t1", message_id: "m1", error: "boom" }));
    expect(useChatStore.getState().streamingTurn).toBeNull();
  });

  it("closes the SSE client on unmount", () => {
    const { unmount } = renderHook(() => useChatStream("t1"), { wrapper });
    unmount();
    expect(mockClose).toHaveBeenCalled();
  });
});
