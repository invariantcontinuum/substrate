import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { ContextPickerModal } from "../ContextPickerModal";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/useAuthToken", () => ({
  useAuthToken: () => "test-token",
}));

function withQc(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe("ContextPickerModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(withQc(
      <ContextPickerModal open={false} onClose={() => {}} onAddEntries={() => {}} />
    ));
    expect(container.firstChild).toBeNull();
  });

  it("renders search and tabs when open", () => {
    render(withQc(
      <ContextPickerModal open={true} onClose={() => {}} onAddEntries={() => {}} />
    ));
    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^files$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^communities$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^nodes$/i })).toBeInTheDocument();
  });
});
