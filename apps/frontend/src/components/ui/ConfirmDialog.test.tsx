import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title, body, and default button labels when open", () => {
    render(
      <ConfirmDialog
        open
        title="Confirm action"
        body="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Confirm action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Hidden"
        body="Body"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("applies danger variant to the confirm button", () => {
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        variant="danger"
        confirmLabel="Purge"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const btn = screen.getByRole("button", { name: "Purge" });
    expect(btn.className).toMatch(/danger/);
  });

  it("calls onConfirm and onCancel with no args", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith();

    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith();
  });
});
