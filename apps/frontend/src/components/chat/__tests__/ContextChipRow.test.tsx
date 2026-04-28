import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextChipRow } from "../ContextChipRow";
import type { Entry } from "@/types/chat";

const entries: Entry[] = [
  { type: "file",      file_id: "f1" },
  { type: "directory", sync_id: "s1", prefix: "src/" },
  { type: "node_neighborhood", node_id: "n1", depth: 1, edge_types: ["DEPENDS_ON"] },
];

describe("ContextChipRow", () => {
  it("renders one chip per entry", () => {
    render(<ContextChipRow entries={entries} frozenAt={null} onRemove={() => {}} onAdd={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("calls onRemove when × clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ContextChipRow entries={entries} frozenAt={null} onRemove={onRemove} onAdd={() => {}} />);
    await user.click(screen.getAllByLabelText(/remove chip/i)[0]);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("hides × when frozen", () => {
    render(<ContextChipRow entries={entries} frozenAt="2026-04-27T00:00:00Z" onRemove={() => {}} onAdd={() => {}} />);
    expect(screen.queryByLabelText(/remove chip/i)).toBeNull();
  });

  it("shows the + add-button only when not frozen", () => {
    const { rerender } = render(
      <ContextChipRow entries={entries} frozenAt={null} onRemove={() => {}} onAdd={() => {}} />
    );
    expect(screen.getByLabelText(/add context/i)).toBeInTheDocument();
    rerender(<ContextChipRow entries={entries} frozenAt="2026-04-27T00:00:00Z" onRemove={() => {}} onAdd={() => {}} />);
    expect(screen.queryByLabelText(/add context/i)).toBeNull();
  });

  it("calls onAdd when + clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ContextChipRow entries={[]} frozenAt={null} onRemove={() => {}} onAdd={onAdd} />);
    await user.click(screen.getByLabelText(/add context/i));
    expect(onAdd).toHaveBeenCalled();
  });

  it("renders correct icon for each entry type", () => {
    const allTypes: Entry[] = [
      { type: "source",    source_id: "s1" },
      { type: "snapshot",  sync_id: "sy1" },
      { type: "directory", sync_id: "sy1", prefix: "src/" },
      { type: "file",      file_id: "f1" },
      { type: "community", cache_key: "c", community_index: 3 },
      { type: "node_neighborhood", node_id: "n1", depth: 2, edge_types: ["DEPENDS_ON","CALLS"] },
    ];
    render(<ContextChipRow entries={allTypes} frozenAt={null} onRemove={() => {}} onAdd={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });
});
