// frontend/src/components/modals/sources/AddSourceInput.tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSources } from "@/hooks/useSources";

function parseRepoUrl(url: string): { owner: string; name: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length >= 2) return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
  } catch { /* ignore */ }
  return null;
}

interface Props {
  onAdded?: (sourceId: string) => void;
}

export function AddSourceInput({ onAdded }: Props) {
  const { sources, createSource } = useSources();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const parsed = parseRepoUrl(url.trim());
    if (!parsed) {
      setError("Enter a valid GitHub URL");
      return;
    }
    const existing = sources.find(
      (s) => s.source_type === "github_repo" && s.owner === parsed.owner && s.name === parsed.name
    );
    if (existing) {
      onAdded?.(existing.id);
      setUrl("");
      return;
    }
    setBusy(true);
    try {
      const created = await createSource({
        source_type: "github_repo", owner: parsed.owner, name: parsed.name, url: url.trim(),
      });
      onAdded?.(created.id);
      setUrl("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-source-input">
      <Input
        type="text"
        placeholder="https://github.com/owner/repo"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button onClick={submit} disabled={!url.trim() || busy}>
        <Plus size={14} /> Add
      </Button>
      {error && <div className="add-source-input-error">{error}</div>}
    </div>
  );
}
