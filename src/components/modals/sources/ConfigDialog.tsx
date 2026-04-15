import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Props {
  sourceId: string;
  onClose: () => void;
}

export function ConfigDialog({ sourceId, onClose }: Props) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();
  const [text, setText] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !sourceId) return;
    apiFetch<{ config?: Record<string, unknown> }>(`/api/sources/${sourceId}`, token)
      .then((s) => setText(JSON.stringify(s.config ?? {}, null, 2)))
      .catch(() => setText("{}"));
  }, [sourceId, token]);

  const save = async () => {
    setError(null);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (e) { setError(`Invalid JSON: ${e}`); return; }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setError("Config must be a JSON object"); return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/sources/${sourceId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ config: parsed }),
      });
      qc.invalidateQueries({ queryKey: ["sources"] });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="config-dialog" role="dialog" aria-label="Edit source config">
      <textarea
        className="config-dialog-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {error && <div className="config-dialog-error">{error}</div>}
      <div className="config-dialog-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>Save</Button>
      </div>
    </div>
  );
}
