import { describe, it, expect } from "vitest";
import { formatDuration, formatCount } from "./formatStats";

describe("formatDuration", () => {
  it("renders sub-second values as ms", () => {
    expect(formatDuration(812)).toBe("812 ms");
  });
  it("renders sub-minute values as Ns", () => {
    expect(formatDuration(42_300)).toBe("42 s");
  });
  it("renders sub-hour values as NmSs", () => {
    expect(formatDuration(4 * 60_000 + 12_000)).toBe("4m 12s");
  });
  it("renders multi-hour values as NhMMm", () => {
    expect(formatDuration(3_780_000)).toBe("1h 03m");
  });
  it("returns em-dash for null / undefined / NaN", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("formatCount", () => {
  it("formats integers with thousands separators", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });
  it("returns em-dash for null / undefined", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(undefined)).toBe("—");
  });
});
