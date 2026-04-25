import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Composer } from "./Composer";
import { useChatStore } from "@/stores/chat";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test" } }),
}));

const sendMock = vi.fn().mockResolvedValue({ user_message: { id: "u1" }, status: "streaming" });
vi.mock("@/hooks/useChatMutations", () => ({
  useSendTurn: () => ({ mutateAsync: sendMock, isPending: false }),
  useCreateThread: () => ({ mutateAsync: vi.fn().mockResolvedValue({ id: "t1" }), isPending: false }),
}));

function renderC(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  sendMock.mockClear();
  useChatStore.setState({ streamingTurn: null, composerDraft: "" });
});

describe("Composer", () => {
  it("Enter triggers send", async () => {
    renderC(<Composer threadId="t1" />);
    const ta = screen.getByPlaceholderText(/Ask anything/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    // mutateAsync is called inside an async closure; assert by next-tick microtask
    await Promise.resolve();
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: "t1", content: "hello" }));
  });
});
