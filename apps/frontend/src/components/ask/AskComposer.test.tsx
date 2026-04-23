import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AskComposer } from "./AskComposer";
import { useAskStore } from "@/stores/ask";

const mutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/hooks/useAskMutations", () => ({
  useSendTurn: () => ({ mutateAsync }),
}));
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "t" } }),
}));

function wrap(ui: React.ReactElement) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe("AskComposer", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    useAskStore.setState({ composerDraft: "", sendingTurn: false });
  });

  it("disables send when empty", () => {
    render(wrap(<AskComposer threadId="t1" />));
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("Enter sends the turn", () => {
    render(wrap(<AskComposer threadId="t1" />));
    const ta = screen.getByPlaceholderText(/Ask about the graph/i);
    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(mutateAsync).toHaveBeenCalledWith("hi");
  });

  it("Shift+Enter does not send", () => {
    render(wrap(<AskComposer threadId="t1" />));
    const ta = screen.getByPlaceholderText(/Ask about the graph/i);
    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("disables input without a threadId", () => {
    render(wrap(<AskComposer threadId={null} />));
    expect(screen.getByPlaceholderText(/Select or create a thread/i)).toBeDisabled();
  });
});
