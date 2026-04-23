import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MessageBubble } from "./MessageBubble";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";
import type { AskMessage } from "@/hooks/useAskMessages";

const base: AskMessage = {
  id: "m1",
  role: "assistant",
  content: "The answer is X.",
  citations: [{ node_id: "n1", name: "file.py", type: "file" }],
  created_at: "2026-04-23T00:00:00Z",
};

describe("MessageBubble", () => {
  beforeEach(() => {
    useUIStore.setState({ activeView: "graph", activeModal: null });
    useGraphStore.setState({ selectedNodeId: null });
  });

  it("renders content and citation chip", () => {
    render(<MessageBubble message={base} />);
    expect(screen.getByText("The answer is X.")).toBeInTheDocument();
    expect(screen.getByText("file.py")).toBeInTheDocument();
  });

  it("citation click sets active view, selected node, and opens node detail", () => {
    render(<MessageBubble message={base} />);
    fireEvent.click(screen.getByRole("listitem"));

    expect(useUIStore.getState().activeView).toBe("graph");
    expect(useGraphStore.getState().selectedNodeId).toBe("n1");
    expect(useUIStore.getState().activeModal).toBe("nodeDetail");
  });

  it("user role hides citation chips", () => {
    render(<MessageBubble message={{ ...base, role: "user" }} />);
    expect(screen.queryByText("file.py")).not.toBeInTheDocument();
  });
});
