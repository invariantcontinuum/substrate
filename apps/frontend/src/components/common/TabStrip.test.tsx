import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TabStrip } from "./TabStrip";

describe("TabStrip", () => {
  it("highlights the tab matching the current URL", () => {
    render(
      <MemoryRouter initialEntries={["/sources/config"]}>
        <TabStrip items={[
          { to: "/sources", label: "Sources" },
          { to: "/sources/config", label: "Config" },
        ]} />
      </MemoryRouter>,
    );
    const active = screen.getByText("Config").closest("a");
    expect(active?.className).toContain("active");
    const inactive = screen.getByText("Sources").closest("a");
    expect(inactive?.className).not.toContain("active");
  });

  it("renders every item", () => {
    render(
      <MemoryRouter initialEntries={["/sources"]}>
        <TabStrip items={[
          { to: "/sources", label: "Sources" },
          { to: "/sources/snapshots", label: "Snapshots" },
          { to: "/sources/config", label: "Config" },
          { to: "/sources/activity", label: "Activity" },
        ]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Snapshots")).toBeInTheDocument();
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });
});
