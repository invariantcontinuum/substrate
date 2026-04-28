import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { SettingsChatTab } from "../SettingsChatTab";

vi.mock("@/hooks/useChatSettings", () => ({
  useChatSettings:        () => ({ data: { history_turns: 12 } }),
  usePatchChatSettings:   () => ({ mutate: vi.fn() }),
  useDeleteAllThreads:    () => ({ mutate: vi.fn() }),
  useArchiveAllThreads:   () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useAuthToken", () => ({
  useAuthToken: () => "test-token",
}));

function withQc(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe("SettingsChatTab", () => {
  it("renders history turns input pre-filled with default", () => {
    render(withQc(<SettingsChatTab />));
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("12");
  });

  it("requires confirmation before delete-all", async () => {
    const user = userEvent.setup();
    render(withQc(<SettingsChatTab />));
    await user.click(screen.getByRole("button", { name: /delete all chats/i }));
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
  });

  it("offers an Archive all button", () => {
    render(withQc(<SettingsChatTab />));
    expect(screen.getByRole("button", { name: /archive all chats/i })).toBeInTheDocument();
  });
});
