import { render, screen } from "@testing-library/react";
import { ContextBudgetPill } from "../ContextBudgetPill";

describe("ContextBudgetPill", () => {
  it("neutral state under 80%", () => {
    const { container } = render(<ContextBudgetPill tokens={1000} cap={10000} isEstimate={false} />);
    const pill = container.querySelector(".context-budget-pill");
    expect(pill?.classList.contains("state-neutral")).toBe(true);
  });

  it("amber at 80–99%", () => {
    const { container } = render(<ContextBudgetPill tokens={8500} cap={10000} isEstimate={false} />);
    const pill = container.querySelector(".context-budget-pill");
    expect(pill?.classList.contains("state-amber")).toBe(true);
  });

  it("over at 100%+", () => {
    const { container } = render(<ContextBudgetPill tokens={11000} cap={10000} isEstimate={false} />);
    const pill = container.querySelector(".context-budget-pill");
    expect(pill?.classList.contains("state-over")).toBe(true);
    expect(pill?.getAttribute("title")).toMatch(/LLM Connections/);
  });

  it("shows estimate badge when isEstimate=true", () => {
    render(<ContextBudgetPill tokens={100} cap={1000} isEstimate={true} />);
    expect(screen.getByText(/estimate/i)).toBeInTheDocument();
  });

  it("displays formatted tokens / cap", () => {
    render(<ContextBudgetPill tokens={12345} cap={24000} isEstimate={false} />);
    expect(screen.getByText(/12,345/)).toBeInTheDocument();
    expect(screen.getByText(/24,000/)).toBeInTheDocument();
  });
});
