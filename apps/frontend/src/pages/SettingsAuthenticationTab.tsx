/**
 * Authentication tab. Reads the gateway-owned ``auth`` config section
 * and surfaces the issuer/realm/client info as read-only chrome.
 * The "Manage account" link punches through to Keycloak's account
 * console (computed by the gateway from ``keycloak_account_console_url``
 * with a fallback to ``<keycloak_url>/realms/<realm>/account/``).
 *
 * Also surfaces the live OIDC session info (current expires-in clock)
 * and a "Sign out all devices" button — both moved here from the
 * Profile tab so identity/session concerns live together.
 */
import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { useEffectiveConfig } from "@/hooks/useRuntimeConfig";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { ConfirmButton } from "@/components/common/ConfirmButton";

interface AuthConfig {
  keycloak_url?: string;
  keycloak_realm?: string;
  keycloak_public_client_id?: string;
  keycloak_account_console_url?: string;
}

interface OidcProfile {
  exp?: number;
}

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

export function SettingsAuthenticationTab() {
  const { config } = useEffectiveConfig<AuthConfig>("auth");
  const auth = useAuth();
  const profile = (auth.user?.profile ?? {}) as OidcProfile;
  const exp = profile.exp;

  // Re-render once a second so the countdown stays live without
  // pulling in a heavyweight clock dep.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  return (
    <section className="settings-auth">
      <h3>Authentication</h3>

      <h4 className="settings-auth__subhead">Current session</h4>
      <Field label="Session expires in" value={expiresIn(exp)} readonly />
      <ConfirmButton
        onConfirm={signOutAll}
        className="btn-ghost"
        confirmLabel="Really sign out everywhere?"
      >
        Sign out all devices
      </ConfirmButton>

      <h4 className="settings-auth__subhead">Identity provider</h4>
      <Field label="Issuer URL" value={config.keycloak_url ?? ""} readonly />
      <Field label="Realm" value={config.keycloak_realm ?? ""} readonly />
      <Field
        label="Public client id"
        value={config.keycloak_public_client_id ?? "substrate-frontend"}
        readonly
      />
      {config.keycloak_account_console_url && (
        <a
          className="btn-ghost"
          target="_blank"
          rel="noreferrer"
          href={config.keycloak_account_console_url}
        >
          Manage account ↗
        </a>
      )}
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  readonly?: boolean;
  type?: "text" | "number" | "password";
}

function Field({ label, value, readonly = false, type = "text" }: FieldProps) {
  return (
    <label className="conn-field">
      <span>{label}</span>
      <input type={type} value={value} readOnly={readonly} />
    </label>
  );
}
