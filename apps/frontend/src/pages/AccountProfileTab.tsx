import { useAuth } from "react-oidc-context";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Row } from "@/components/common/Row";
import { Avatar } from "@/components/account/Avatar";
import { ConfirmButton } from "@/components/common/ConfirmButton";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useProfileIdps } from "@/hooks/useProfileIdps";
import { useEffectiveConfig } from "@/hooks/useRuntimeConfig";
import { usePreferences } from "@/hooks/usePreferences";
import { usePrefsStore, type ThemePref } from "@/stores/prefs";

function expiresIn(tokenExp: number | undefined): string {
  if (!tokenExp) return "—";
  const s = tokenExp - Math.floor(Date.now() / 1000);
  if (s < 0) return "expired";
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return m > 0 ? `${m} min ${rs}s` : `${rs}s`;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

interface OidcProfile {
  name?: string;
  preferred_username?: string;
  email?: string;
  exp?: number;
}

interface AuthSection {
  keycloak_account_console_url?: string;
}

function prettifyIdp(alias: string): string {
  // Map common Keycloak IDP aliases to display labels. Falls back to a
  // capitalised version of the alias so we always render something
  // human-readable rather than the raw "github" / "google" slug.
  const known: Record<string, string> = {
    github: "GitHub",
    google: "Google",
    gitlab: "GitLab",
    bitbucket: "Bitbucket",
    microsoft: "Microsoft",
    azure: "Azure",
    facebook: "Facebook",
    apple: "Apple",
  };
  const lower = alias.toLowerCase();
  if (known[lower]) return known[lower];
  return alias.charAt(0).toUpperCase() + alias.slice(1);
}

export function AccountProfileTab() {
  // Hydrate prefs (theme/telemetry persistence). Safe to call multiple
  // times — the hook short-circuits once the store has been hydrated.
  usePreferences();
  const auth = useAuth();
  const profile = (auth.user?.profile ?? {}) as OidcProfile;
  const name = profile.name ?? profile.preferred_username;
  const email = profile.email;
  const exp = profile.exp;

  const { idps } = useProfileIdps();
  const { config: authConfig } = useEffectiveConfig<AuthSection>("auth");
  const accountConsoleUrl = authConfig.keycloak_account_console_url;

  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  const telemetry = usePrefsStore((s) => s.telemetry);
  const setTelemetry = usePrefsStore((s) => s.setTelemetry);

  const signOutAll = async () => {
    const tok = authToken();
    if (!tok) return;
    try {
      await apiFetch("/api/users/me/sessions/revoke-all", tok, {
        method: "POST",
      });
      await auth.signoutRedirect();
    } catch (err) {
      logger.warn("revoke_all_failed", { error: String(err) });
    }
  };

  const requestDelete = async () => {
    const tok = authToken();
    if (!tok) return;
    try {
      await apiFetch("/api/users/me/deletion-request", tok, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
    } catch (err) {
      // 501 expected until backend exists — surface a console warning
      // rather than an alert so the stubbed button doesn't annoy the user.
      logger.warn("deletion_request_failed", { error: String(err) });
    }
  };

  return (
    <>
      <div className="profile-head">
        <Avatar name={name} email={email} />
        <div>
          <div className="profile-name">{name ?? "—"}</div>
          <div className="profile-email">{email ?? "—"}</div>
        </div>
        <button
          className="cta-ghost"
          onClick={() => auth.signoutRedirect()}
        >
          Sign out
        </button>
      </div>

      <SectionHeader title="Account" />
      <Row k="Name" v={name ?? "—"} />
      <Row k="Email" v={email ?? "—"} />
      {idps.length > 0 && (
        <Row
          k="Signed in via"
          v={
            <span className="idp-chip-row">
              {idps.map((p) => (
                <span key={p} className="idp-chip">
                  {prettifyIdp(p)}
                </span>
              ))}
            </span>
          }
        />
      )}
      {accountConsoleUrl && (
        <Row
          k="Manage account"
          v={
            <a
              href={accountConsoleUrl}
              target="_blank"
              rel="noreferrer"
              className="cta-ghost"
            >
              Open Keycloak ↗
            </a>
          }
        />
      )}

      <SectionHeader title="Appearance" />
      <Row
        k="Theme"
        v={
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePref)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        }
      />

      <SectionHeader title="Telemetry" />
      <Row
        k="Send anonymous render times"
        v={
          <label>
            <input
              type="checkbox"
              checked={telemetry}
              onChange={(e) => setTelemetry(e.target.checked)}
            />{" "}
            {telemetry ? "on" : "off"}
          </label>
        }
      />

      <SectionHeader title="Session" />
      <Row k="Session expires" v={expiresIn(exp)} />
      <Row align="end">
        <ConfirmButton
          onConfirm={signOutAll}
          className="cta-ghost"
          confirmLabel="Really sign out everywhere?"
        >
          Sign out all devices
        </ConfirmButton>
      </Row>

      <SectionHeader title="Danger zone" />
      <Row danger align="end">
        <ConfirmButton
          onConfirm={requestDelete}
          className="cta-ghost"
          confirmLabel="Request account deletion?"
        >
          Delete account data
        </ConfirmButton>
      </Row>
    </>
  );
}
