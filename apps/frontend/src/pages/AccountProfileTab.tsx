import { useAuth } from "react-oidc-context";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Row } from "@/components/common/Row";
import { Avatar } from "@/components/account/Avatar";
import { ConfirmButton } from "@/components/common/ConfirmButton";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";

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

export function AccountProfileTab() {
  const auth = useAuth();
  const profile = (auth.user?.profile ?? {}) as OidcProfile;
  const name = profile.name ?? profile.preferred_username;
  const email = profile.email;
  const exp = profile.exp;

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

      <SectionHeader title="Session" />
      <Row k="Signed in via" v="Keycloak (substrate)" />
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
