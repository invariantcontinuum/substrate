/**
 * Authentication tab. Reads the gateway-owned ``auth`` config section
 * and surfaces the issuer/realm/client info as read-only chrome.
 * The "Manage account" link punches through to Keycloak's account
 * console (computed by the gateway from ``keycloak_account_console_url``
 * with a fallback to ``<keycloak_url>/realms/<realm>/account/``).
 */
import { useEffectiveConfig } from "@/hooks/useRuntimeConfig";

interface AuthConfig {
  keycloak_url?: string;
  keycloak_realm?: string;
  keycloak_public_client_id?: string;
  keycloak_account_console_url?: string;
}

export function SettingsAuthenticationTab() {
  const { config } = useEffectiveConfig<AuthConfig>("auth");

  return (
    <section className="settings-auth">
      <h3>Authentication</h3>
      <Field label="Issuer URL" value={config.keycloak_url ?? ""} readonly />
      <Field label="Realm" value={config.keycloak_realm ?? ""} readonly />
      <Field
        label="Public client id"
        value={config.keycloak_public_client_id ?? "substrate-frontend"}
        readonly
      />
      {config.keycloak_account_console_url && (
        <a
          className="cta-ghost"
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
