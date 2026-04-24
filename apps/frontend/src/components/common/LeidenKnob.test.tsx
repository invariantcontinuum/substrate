import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeidenKnob } from "./LeidenKnob";

describe("LeidenKnob", () => {
  it("binds value and emits onChange", () => {
    const onChange = vi.fn();
    render(<LeidenKnob label="Resolution" min={0.1} max={5} step={0.1} value={1.0} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2.0" } });
    expect(onChange).toHaveBeenCalledWith(2.0);
  });

  it("shows the current value", () => {
    render(<LeidenKnob label="X" min={0} max={10} step={1} value={3} onChange={vi.fn()} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});
