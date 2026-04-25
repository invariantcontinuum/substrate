import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Message } from "./Message";

describe("Message", () => {
  it("renders user message right-aligned", () => {
    render(
      <Message message={{
        id: "m1", thread_id: "t1", role: "user",
        content: "hi", citations: [], created_at: "2026-04-25T10:00:00Z",
      } as never} />,
    );
    expect(screen.getByText(/hi/)).toBeInTheDocument();
  });
  it("renders streaming caret when isStreaming is true", () => {
    const { container } = render(
      <Message message={{
        id: "m1", thread_id: "t1", role: "assistant",
        content: "thinking", citations: [], created_at: "2026-04-25T10:00:00Z",
      } as never} isStreaming />,
    );
    expect(container.querySelector(".message-cursor")).not.toBeNull();
  });
});
