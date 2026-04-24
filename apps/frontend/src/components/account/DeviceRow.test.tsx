import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeviceRow, type DeviceShape } from "./DeviceRow";

const DEV: DeviceShape = {
  device_id: "d1",
  name: "Z2 Mini",
  user_agent: "Chromium 128 / Linux",
  last_loaded_sync_ids: ["a", "b"],
  last_seen_at: "2026-04-23T12:00:00Z",
};

describe("DeviceRow", () => {
  it("marks current device with chip", () => {
    render(
      <DeviceRow
        device={DEV}
        isCurrent
        onRename={vi.fn()}
        onForget={vi.fn()}
      />,
    );
    expect(screen.getByText(/this device/i)).toBeInTheDocument();
  });

  it("forget is disabled on the current device", () => {
    render(
      <DeviceRow
        device={DEV}
        isCurrent
        onRename={vi.fn()}
        onForget={vi.fn()}
      />,
    );
    const forget = screen.getByRole("button", { name: /forget/i });
    expect(forget).toBeDisabled();
  });

  it("rename calls onRename with new value", () => {
    const onRename = vi.fn();
    render(
      <DeviceRow
        device={DEV}
        isCurrent={false}
        onRename={onRename}
        onForget={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByDisplayValue("Z2 Mini");
    fireEvent.change(input, { target: { value: "Work laptop" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onRename).toHaveBeenCalledWith("Work laptop");
  });
});
