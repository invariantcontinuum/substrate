import { useState } from "react";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Row } from "@/components/common/Row";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";

interface GhResult {
  login?: string;
  scopes?: string[];
  error?: string;
}

/**
 * Settings · GitHub tab.
 *
 * Lets users paste a Personal Access Token and probe
 * ``POST /api/integrations/github/validate`` so they can confirm the
 * token is live and enumerates their scopes before wiring it into an
 * ingestion-worker env. We never persist the PAT here — gateway
 * ``GET /api/config/github`` deliberately omits ``github_pat`` from
 * the read surface (see ``services/gateway/src/api/internal_config.py``)
 * so the only persistence path is the operator-driven env update.
 */
export function SettingsGitHubTab() {
  const token = useAuthToken();
  const [pat, setPat] = useState("");
  const [probing, setProbing] = useState(false);
  const [gh, setGh] = useState<GhResult | null>(null);

  const validate = async () => {
    if (!token || !pat) return;
    setProbing(true);
    try {
      const r = await apiFetch<{ login: string; scopes: string[] }>(
        "/api/integrations/github/validate",
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pat }),
        },
      );
      setGh(r);
    } catch (e) {
      setGh({ error: (e as Error).message });
    } finally {
      setProbing(false);
    }
  };

  return (
    <section className="settings-github">
      <h3>GitHub</h3>
      <SectionHeader title="Personal Access Token" />
      <Row
        k="Paste token to validate"
        v={
          <div className="github-token-row">
            <input
              type="password"
              className="ui-input github-token-input"
              placeholder="ghp_…"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              autoComplete="off"
            />
            <button
              className="btn-secondary"
              onClick={validate}
              disabled={!pat || probing}
            >
              {probing ? "Validating…" : "Validate"}
            </button>
          </div>
        }
      />
      {gh?.login && (
        <Row
          k="Status"
          v={
            <span className="github-status github-status-ok">
              ✓ {gh.login} · scopes: {gh.scopes?.join(", ") || "none"}
            </span>
          }
        />
      )}
      {gh?.error && (
        <Row
          k="Status"
          v={<span className="github-status github-status-err">✗ {gh.error}</span>}
        />
      )}

      <SectionHeader title="More GitHub config" />
      <p className="muted github-coming-soon">
        Webhook routing, repo scoping, and per-source PAT bindings are
        coming in a follow-up release. For now, paste a PAT above to
        confirm GitHub will accept it before you wire it into an
        ingestion worker env.
      </p>
    </section>
  );
}
