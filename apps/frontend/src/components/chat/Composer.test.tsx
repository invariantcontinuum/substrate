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

const cancelMock = vi.fn();
vi.mock("@/hooks/useCancelStream", () => ({
  useCancelStream: () => ({ mutate: cancelMock, isPending: false }),
}));

function renderC(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  sendMock.mockClear();
  cancelMock.mockClear();
  useChatStore.setState({ streamingTurn: null, composerDraft: "" });
});

describe("Composer", () => {
  it("Enter triggers send", async () => {
    renderC(<Composer threadId="t1" />);
    const ta = screen.getByPlaceholderText(/Ask anything/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    await Promise.resolve();
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: "t1", content: "hello" }));
  });

  it("renders Stop button while streaming and cancels on click", () => {
    useChatStore.setState({
      streamingTurn: { threadId: "t1", messageId: "m1", content: "partial" },
    });
    renderC(<Composer threadId="t1" />);
    const stopBtn = screen.getByLabelText(/Stop streaming/i);
    fireEvent.click(stopBtn);
    expect(cancelMock).toHaveBeenCalledWith("m1");
    expect(useChatStore.getState().streamingTurn).toBeNull();
  });
});
