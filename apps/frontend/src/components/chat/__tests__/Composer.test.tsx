import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mocks must be hoisted before the component import
vi.mock("@/hooks/useThreadEntries", () => ({
  useThreadEntries: () => ({
    data: { entries: [{ type: "file", file_id: "f1" }], frozen_at: null },
  }),
  useApplyThreadEntries: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useTokenizePrompt", () => ({
  useTokenizePrompt: () => ({
    data: { tokens: 100, prompt_chars: 400, error: null },
  }),
}));

vi.mock("@/hooks/useRuntimeConfig", () => ({
  useEffectiveConfig: () => ({
    config: { context_window_tokens: 24_000 },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useChatMutations", () => ({
  useSendTurn: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateThread: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useCancelStream", () => ({
  useCancelStream: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Store mock: expose setters so we can vary draft
const storeMockState = {
  composerDraft: "hello",
  setComposerDraft: vi.fn(),
  streamingTurn: null as null | { threadId: string; messageId: string; content: string },
  setStreamingTurn: vi.fn(),
  setActiveThreadId: vi.fn(),
};

vi.mock("@/stores/chat", () => ({
  useChatStore: (selector: (s: typeof storeMockState) => unknown) =>
    selector(storeMockState),
}));

// Mock child components to avoid their own hook deps
vi.mock("../ContextChipRow", () => ({
  ContextChipRow: ({
    onAdd,
  }: {
    entries: unknown[];
    frozenAt: unknown;
    onRemove: unknown;
    onAdd: () => void;
  }) => (
    <div data-testid="chip-row">
      <button onClick={onAdd} aria-label="Add context">
        +
      </button>
    </div>
  ),
}));

vi.mock("../ContextPickerModal", () => ({
  ContextPickerModal: ({
    open,
  }: {
    open: boolean;
    onClose: unknown;
    onAddEntries: unknown;
  }) => (open ? <div data-testid="picker-modal" /> : null),
}));

vi.mock("../ContextBudgetPill", () => ({
  ContextBudgetPill: () => <div data-testid="budget-pill" />,
}));

import { Composer } from "../Composer";

function withQc(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe("Composer", () => {
  it("enables Send when entries present, under budget, and has text", () => {
    storeMockState.composerDraft = "hello";
    render(withQc(<Composer threadId="t1" />));
    const send = screen.getByRole("button", { name: /send/i });
    expect(send).not.toBeDisabled();
  });

  it("disables Send when draft is empty", () => {
    storeMockState.composerDraft = "";
    render(withQc(<Composer threadId="t1" />));
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    // restore
    storeMockState.composerDraft = "hello";
  });

  it("renders chip row", () => {
    render(withQc(<Composer threadId="t1" />));
    expect(screen.getByTestId("chip-row")).toBeInTheDocument();
  });

  it("renders budget pill", () => {
    render(withQc(<Composer threadId="t1" />));
    expect(screen.getByTestId("budget-pill")).toBeInTheDocument();
  });

  it("picker modal opens when + is clicked", async () => {
    const user = userEvent.setup();
    render(withQc(<Composer threadId="t1" />));
    expect(screen.queryByTestId("picker-modal")).toBeNull();
    await user.click(screen.getByLabelText(/add context/i));
    expect(screen.getByTestId("picker-modal")).toBeInTheDocument();
  });
});
