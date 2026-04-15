// frontend/src/components/modals/sources/SourceOpsToolbar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceOpsToolbar } from "./SourceOpsToolbar";

const startSync = vi.fn();
vi.mock("@/hooks/useSyncs", () => ({
  useSyncs: () => ({ startSync, cancelSync: vi.fn(), activeSyncs: [] })
}));
vi.mock("@/hooks/useSources", () => ({
  useSources: () => ({ sources: [], purgeSource: vi.fn() })
}));

describe("SourceOpsToolbar", () => {
  it("label reflects selection count", () => {
    render(
      <SourceOpsToolbar selectedSourceIds={new Set(["a", "b"])}
        onOpenSchedule={() => {}} onOpenConfig={() => {}} />
    );
    expect(screen.getByRole("button", { name: /Sync \(2 sources\)/ })).toBeInTheDocument();
  });

  it("Sync fans out per unique source", async () => {
    startSync.mockClear();
    render(
      <SourceOpsToolbar selectedSourceIds={new Set(["a", "b"])}
        onOpenSchedule={() => {}} onOpenConfig={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Sync \(2 sources\)/ }));
    // Wait for async iterations
    await new Promise((r) => setTimeout(r, 0));
    expect(startSync).toHaveBeenCalledTimes(2);
    expect(startSync).toHaveBeenCalledWith({ source_id: "a" });
    expect(startSync).toHaveBeenCalledWith({ source_id: "b" });
  });

  it("is disabled when no selection", () => {
    render(
      <SourceOpsToolbar selectedSourceIds={new Set()}
        onOpenSchedule={() => {}} onOpenConfig={() => {}} />
    );
    expect(screen.getByRole("button", { name: /^Sync$/ })).toBeDisabled();
  });
});
