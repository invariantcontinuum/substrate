// frontend/src/components/modals/sources/ScheduleStrip.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScheduleStrip } from "./ScheduleStrip";

vi.mock("@/hooks/useSchedules", () => ({
  useSchedules: () => ({
    schedules: [],
    createSchedule: vi.fn(),
    toggleSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  }),
}));

describe("ScheduleStrip", () => {
  it("shows +Schedule when empty", () => {
    render(<ScheduleStrip sourceId="s1" />);
    expect(screen.getByText(/\+ Schedule/i)).toBeInTheDocument();
  });
});
