import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThreadListItem } from "./ThreadListItem";

const rename = vi.fn();
const remove = vi.fn();

vi.mock("@/hooks/useChatMutations", () => ({
  useRenameThread: () => ({ mutate: rename }),
  useDeleteThread: () => ({ mutate: remove }),
}));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ user: { access_token: "t" } }) }));

const thread = {
  id: "t1",
  title: "Old",
  created_at: "",
  updated_at: "",
  last_message_preview: null,
};

function wrap(ui: React.ReactElement) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe("ThreadListItem", () => {
  beforeEach(() => {
    rename.mockClear();
    remove.mockClear();
  });

  it("double-click enters edit; Enter commits rename", () => {
    render(wrap(<ThreadListItem thread={thread} active={false} onSelect={() => {}} />));
    fireEvent.doubleClick(screen.getByText("Old"));
    const input = screen.getByDisplayValue("Old") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(rename).toHaveBeenCalledWith({ id: "t1", title: "New" });
  });

  it("Escape cancels rename", () => {
    render(wrap(<ThreadListItem thread={thread} active={false} onSelect={() => {}} />));
    fireEvent.doubleClick(screen.getByText("Old"));
    const input = screen.getByDisplayValue("Old") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Abandoned" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(rename).not.toHaveBeenCalled();
  });

  it("delete button triggers useDeleteThread", () => {
    render(wrap(<ThreadListItem thread={thread} active={false} onSelect={() => {}} />));
    fireEvent.click(screen.getByLabelText("Delete thread"));
    expect(remove).toHaveBeenCalledWith("t1");
  });
});
