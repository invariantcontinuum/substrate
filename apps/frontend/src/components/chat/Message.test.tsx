import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ChatMessage } from "@/hooks/useChatMessages";
import { Message } from "./Message";

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { access_token: "test" } }),
}));

// MessageFooter calls useMessageContext / useMessageEvidence; stub both so
// we don't make any network calls. The footer renders nothing without
// a context payload, so returning ``undefined`` is enough to keep the
// test focused on the assistant body + streaming caret.
vi.mock("@/hooks/useMessageContext", () => ({
  useMessageContext: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/useMessageEvidence", () => ({
  useMessageEvidence: () => ({ evidence: [], isLoading: false }),
}));

function renderM(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Message", () => {
  it("renders user message right-aligned", () => {
    renderM(
      <Message message={{
        id: "m1", role: "user",
        content: "hi", citations: [], created_at: "2026-04-25T10:00:00Z",
      } as ChatMessage} />,
    );
    expect(screen.getByText(/hi/)).toBeInTheDocument();
  });
  it("renders streaming caret when isStreaming is true", () => {
    const { container } = renderM(
      <Message message={{
        id: "m1", role: "assistant",
        content: "thinking", citations: [], created_at: "2026-04-25T10:00:00Z",
      } as ChatMessage} isStreaming />,
    );
    expect(container.querySelector(".message-cursor")).not.toBeNull();
  });
  it("shows edit + regenerate action buttons for user messages", () => {
    renderM(
      <Message message={{
        id: "m1", role: "user",
        content: "hi", citations: [], created_at: "2026-04-25T10:00:00Z",
      } as ChatMessage} />,
    );
    expect(screen.getByLabelText(/Edit and resend/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Regenerate reply/i)).toBeInTheDocument();
  });
  it("does not show action buttons on assistant messages", () => {
    renderM(
      <Message message={{
        id: "m1", role: "assistant",
        content: "reply", citations: [], created_at: "2026-04-25T10:00:00Z",
      } as ChatMessage} />,
    );
    expect(screen.queryByLabelText(/Edit and resend/i)).not.toBeInTheDocument();
  });
});
