import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfigDialog } from "./ConfigDialog";

const updateSource = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/useSources", () => ({
  useSources: () => ({ updateSource }),
}));

const source = {
  id: "s1",
  source_type: "github_repo",
  owner: "acme",
  name: "acme/repo",
  url: "https://github.com/acme/repo",
  default_branch: "main",
  enabled: true,
  config: {},
  last_sync_id: null,
  last_synced_at: null,
};

describe("ConfigDialog", () => {
  it("does not render when closed", () => {
    render(<ConfigDialog open={false} source={source} onClose={() => {}} />);
    expect(screen.queryByText(/configure/i)).not.toBeInTheDocument();
  });

  it("renders both sections when open", () => {
    render(<ConfigDialog open source={source} onClose={() => {}} />);
    expect(screen.getByLabelText(/^label$/i)).toHaveValue("acme/repo");
    expect(screen.getByLabelText(/url/i)).toHaveValue("https://github.com/acme/repo");
    expect(screen.getByLabelText(/^enabled$/i)).toBeChecked();
    expect(screen.getByLabelText(/age \(days\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/per-source cap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/never prune/i)).toBeInTheDocument();
  });

  it("never_prune disables numeric inputs", () => {
    render(<ConfigDialog open source={source} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/never prune/i));
    expect(screen.getByLabelText(/age \(days\)/i)).toBeDisabled();
    expect(screen.getByLabelText(/per-source cap/i)).toBeDisabled();
  });

  it("save sends only changed keys", async () => {
    updateSource.mockClear();
    render(<ConfigDialog open source={source} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^label$/i), { target: { value: "acme/repo-renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(updateSource).toHaveBeenCalledTimes(1));
    expect(updateSource).toHaveBeenCalledWith({ id: "s1", label: "acme/repo-renamed" });
  });

  it("rejects non-positive retention integers", async () => {
    updateSource.mockClear();
    render(<ConfigDialog open source={source} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/age \(days\)/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/must be positive/i)).toBeInTheDocument();
    expect(updateSource).not.toHaveBeenCalled();
  });
});
