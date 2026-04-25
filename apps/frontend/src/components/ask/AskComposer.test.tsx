import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AskComposer } from "./AskComposer";
import { useChatStore } from "@/stores/chat";

const sendMutateAsync = vi.fn().mockResolvedValue({});
const createMutateAsync = vi.fn().mockResolvedValue({ id: "new-thread" });

vi.mock("@/hooks/useChatMutations", () => ({
  useSendTurn: () => ({ mutateAsync: sendMutateAsync }),
  useCreateThread: () => ({ mutateAsync: createMutateAsync }),
}));
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "t" } }),
}));

function wrap(ui: React.ReactElement) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe("AskComposer", () => {
  beforeEach(() => {
    sendMutateAsync.mockClear();
    createMutateAsync.mockClear();
    useChatStore.setState({ composerDraft: "", sendingTurn: false, activeThreadId: null });
  });

  it("disables send when empty", () => {
    render(wrap(<AskComposer threadId="t1" />));
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("Enter sends the turn when thread exists", () => {
    render(wrap(<AskComposer threadId="t1" />));
    const ta = screen.getByPlaceholderText(/Ask about the graph/i);
    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(sendMutateAsync).toHaveBeenCalledWith({ threadId: "t1", content: "hi" });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("Shift+Enter does not send", () => {
    render(wrap(<AskComposer threadId="t1" />));
    const ta = screen.getByPlaceholderText(/Ask about the graph/i);
    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(sendMutateAsync).not.toHaveBeenCalled();
  });

  it("creates a thread and sends when no threadId", async () => {
    render(wrap(<AskComposer threadId={null} />));
    const ta = screen.getByPlaceholderText(/Ask about the graph/i);
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(createMutateAsync).toHaveBeenCalledWith("hello");
    // After thread creation, send is called
    await new Promise((r) => setTimeout(r, 0));
    expect(sendMutateAsync).toHaveBeenCalledWith({ threadId: "new-thread", content: "hello" });
  });
});
