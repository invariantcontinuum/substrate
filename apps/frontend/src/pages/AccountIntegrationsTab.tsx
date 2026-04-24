import { useState } from "react";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Row } from "@/components/common/Row";
import { apiFetch } from "@/lib/api";

interface GhResult {
  login?: string;
  scopes?: string[];
  error?: string;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

function keycloakAccountUrl(): string {
  const fromEnv = (import.meta.env.VITE_KEYCLOAK_URL as string | undefined) ?? "";
  const realm = (import.meta.env.VITE_KEYCLOAK_REALM as string | undefined)
    ?? "substrate";
  const base = fromEnv.replace(/\/+$/, "");
  return `${base}/realms/${realm}/account`;
}

export function AccountIntegrationsTab() {
  const [token, setToken] = useState("");
  const [probing, setProbing] = useState(false);
  const [gh, setGh] = useState<GhResult | null>(null);

  const validate = async () => {
    const authToken_ = authToken();
    if (!authToken_ || !token) return;
    setProbing(true);
    try {
      const r = await apiFetch<{ login: string; scopes: string[] }>(
        "/api/integrations/github/validate",
        authToken_,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
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
    <>
      <SectionHeader title="GitHub" />
      <Row
        k="Paste token to validate"
        v={
          <>
            <input
              type="password"
              placeholder="ghp_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{
                marginRight: 6,
                fontFamily: "monospace",
                fontSize: 11,
                width: 220,
              }}
            />
            <button
              className="cta-ghost"
              onClick={validate}
              disabled={!token || probing}
            >
              {probing ? "Validating…" : "Validate"}
            </button>
          </>
        }
      />
      {gh?.login && (
        <Row
          k="Status"
          v={
            <span style={{ color: "#a0f0c0" }}>
              ✓ {gh.login} · scopes: {gh.scopes?.join(", ") || "none"}
            </span>
          }
        />
      )}
      {gh?.error && (
        <Row
          k="Status"
          v={<span style={{ color: "#ffaaaa" }}>✗ {gh.error}</span>}
        />
      )}

      <SectionHeader title="Keycloak" />
      <Row k="Realm" v="substrate" />
      <Row
        k="Manage session"
        v={
          <a
            href={keycloakAccountUrl()}
            target="_blank"
            rel="noreferrer"
            className="cta-ghost"
          >
            Manage ↗
          </a>
        }
      />
    </>
  );
}
