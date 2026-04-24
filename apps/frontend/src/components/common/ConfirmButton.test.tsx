import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmButton } from "./ConfirmButton";

describe("ConfirmButton", () => {
  it("requires a second click to invoke onConfirm", () => {
    const cb = vi.fn();
    render(
      <ConfirmButton onConfirm={cb} confirmLabel="Sure?">
        Delete
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(cb).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sure?"));
    expect(cb).toHaveBeenCalledOnce();
  });

  it("auto-disarms after the window elapses", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    render(
      <ConfirmButton onConfirm={cb} confirmLabel="Sure?" windowMs={2000}>
        Delete
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Sure?")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2001);
    });
    expect(screen.getByText("Delete")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("is inert when disabled is true", () => {
    const cb = vi.fn();
    render(
      <ConfirmButton onConfirm={cb} disabled>
        Delete
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Delete"));
    expect(cb).not.toHaveBeenCalled();
  });
});
