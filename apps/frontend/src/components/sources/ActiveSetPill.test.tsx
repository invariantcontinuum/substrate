import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActiveSetPill } from "./ActiveSetPill";
import { useSyncSetStore } from "@/stores/syncSet";

describe("ActiveSetPill", () => {
  it("shows count and opens a popover with loaded syncs", () => {
    useSyncSetStore.setState({
      syncIds: ["11111111-1111-1111-1111-111111111111"],
      deviceId: "d1",
    } as never);
    render(<ActiveSetPill nodeCount={12400} />);
    expect(screen.getByText(/1 sync/)).toBeInTheDocument();
    expect(screen.getByText(/12,400 nodes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
