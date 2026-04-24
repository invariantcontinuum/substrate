import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
    render(<MessageBubble message={base} />, { wrapper: MemoryRouter });
    expect(screen.getByText("The answer is X.")).toBeInTheDocument();
    expect(screen.getByText("file.py")).toBeInTheDocument();
  });

  it("citation click sets active view, selected node, and opens node detail", () => {
    render(<MessageBubble message={base} />, { wrapper: MemoryRouter });
    // With no excerpt field, clicking the chip label itself inspects the
    // node. When an excerpt is present the chip expands the code block
    // instead; that path is covered by the separate excerpt test below.
    fireEvent.click(screen.getByText("file.py"));

    expect(useUIStore.getState().activeView).toBe("graph");
    expect(useGraphStore.getState().selectedNodeId).toBe("n1");
    expect(useUIStore.getState().activeModal).toBe("nodeDetail");
  });

  it("citation with excerpt expands a code block on click", () => {
    const msg: AskMessage = {
      ...base,
      citations: [
        {
          node_id: "n2",
          name: "mod.py",
          type: "file",
          file_path: "src/mod.py",
          excerpt: "def hello():\n    return 1\n",
          language: "python",
        },
      ],
    };
    render(<MessageBubble message={msg} />, { wrapper: MemoryRouter });
    expect(screen.queryByText(/def hello/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("src/mod.py"));
    expect(screen.getByText(/def hello/)).toBeInTheDocument();
    // The inspect-arrow button is separate from the chip.
    expect(useUIStore.getState().activeModal).toBe(null);
  });

  it("user role hides citation chips", () => {
    render(<MessageBubble message={{ ...base, role: "user" }} />, { wrapper: MemoryRouter });
    expect(screen.queryByText("file.py")).not.toBeInTheDocument();
  });
});
