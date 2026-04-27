/**
 * Settings · Authentication tab.
 *
 * Five sections, top to bottom:
 *   1. Current session   — countdown to JWT expiry + "Sign out all devices"
 *   2. Password          — current/new/confirm with inline status
 *   3. Two-factor auth   — TOTP setup modal (QR + secret + 6-digit code)
 *   4. API tokens        — list + create modal that shows plaintext ONCE
 *   5. Devices           — inline list (replaces the old Devices tab)
 *
 * Keycloak issuer/realm/client-id details are intentionally hidden — the
 * earlier read-only display of those values has been removed. Users who
 * need the Keycloak account console can reach it from the Profile tab.
 *
 * All writes go through `useAuthedMutation` over the gateway-owned
 * `/api/users/me/...` routes. The 2FA status query and the API tokens
 * list use react-query so the UI refreshes without ad-hoc polling.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";

import { SectionHeader } from "@/components/common/SectionHeader";
import { Row } from "@/components/common/Row";
import { ConfirmButton } from "@/components/common/ConfirmButton";
import { DeviceRow, type DeviceShape } from "@/components/account/DeviceRow";
import { Modal } from "@/components/ui/Modal";
import { useAuthedMutation } from "@/hooks/useAuthedMutation";
import { useAuthedQuery } from "@/hooks/useAuthedQuery";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSyncSetStore } from "@/stores/syncSet";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";

interface OidcProfile {
  exp?: number;
}

function expiresIn(tokenExp: number | undefined, now: number): string {
  if (!tokenExp) return "—";
  const s = tokenExp - Math.floor(now / 1000);
  if (s < 0) return "expired";
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return m > 0 ? `${m} min ${rs}s` : `${rs}s`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Never";
  return new Date(iso).toLocaleString();
}

interface ApiTokenListEntry {
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

interface ApiTokenCreateResponse {
  id: string;
  label: string;
  prefix: string;
  token: string;
  created_at: string;
  expires_at: string | null;
}

interface TotpSetupResponse {
  secret: string;
  qr_data_url: string;
  otpauth_url: string;
}

interface TotpStatus {
  enabled: boolean;
}

type InlineStatus =
  | { kind: "idle" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function SettingsAuthenticationTab() {
  return (
    <div className="settings-auth">
      <CurrentSessionSection />
      <PasswordSection />
      <TwoFactorSection />
      <ApiTokensSection />
      <DevicesSection />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// 1. Current session
// ────────────────────────────────────────────────────────────────────

function CurrentSessionSection() {
  const auth = useAuth();
  const profile = (auth.user?.profile ?? {}) as OidcProfile;
  const exp = profile.exp;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [status, setStatus] = useState<InlineStatus>({ kind: "idle" });

  const revokeAll = useAuthedMutation<{ ok: boolean }, void>({
    path: () => "/api/users/me/sessions/revoke-all",
    method: "POST",
  });

  const handleSignOutAll = async () => {
    setStatus({ kind: "idle" });
    try {
      await revokeAll.mutateAsync();
      setStatus({ kind: "ok", message: "All sessions signed out." });
      // Bounce through the OIDC end-session endpoint so the local
      // browser session is also cleared.
      window.setTimeout(() => {
        auth.signoutRedirect().catch((err) => {
          logger.warn("signout_redirect_failed", { error: String(err) });
        });
      }, 800);
    } catch (err) {
      logger.warn("revoke_all_failed", { error: String(err) });
      setStatus({
        kind: "error",
        message: "Could not sign out all sessions. Try again.",
      });
    }
  };

  return (
    <>
      <SectionHeader title="Current session" />
      <Row k="Session expires in" v={expiresIn(exp, now)} />
      <Row align="end">
        <ConfirmButton
          className="btn-ghost"
          onConfirm={handleSignOutAll}
          confirmLabel="Really sign out everywhere?"
          disabled={revokeAll.isPending}
        >
          Sign out all devices
        </ConfirmButton>
      </Row>
      {status.kind !== "idle" && (
        <div className={`auth-inline-${status.kind}`}>{status.message}</div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// 2. Password
// ────────────────────────────────────────────────────────────────────

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<InlineStatus>({ kind: "idle" });

  const change = useAuthedMutation<
    unknown,
    { current_password: string; new_password: string }
  >({
    path: () => "/api/users/me/password",
    method: "POST",
    body: (vars) => vars,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "idle" });
    if (next.length < 8) {
      setStatus({
        kind: "error",
        message: "New password must be at least 8 characters.",
      });
      return;
    }
    if (next !== confirm) {
      setStatus({ kind: "error", message: "New passwords don't match." });
      return;
    }
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setStatus({ kind: "ok", message: "Password updated." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      logger.warn("password_change_failed", { error: String(err) });
      setStatus({
        kind: "error",
        message: "Password change rejected. Check the current password.",
      });
    }
  };

  return (
    <>
      <SectionHeader title="Password" />
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-form-field">
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label className="auth-form-field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label className="auth-form-field">
          <span>Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <div className="auth-form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={change.isPending}
          >
            {change.isPending ? "Saving…" : "Change password"}
          </button>
        </div>
        {status.kind !== "idle" && (
          <div className={`auth-inline-${status.kind}`}>{status.message}</div>
        )}
      </form>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// 3. Two-factor authentication
// ────────────────────────────────────────────────────────────────────

function TwoFactorSection() {
  const qc = useQueryClient();
  const statusQuery = useAuthedQuery<TotpStatus>(
    ["users", "me", "2fa", "status"],
    "/api/users/me/2fa/status",
  );
  const enabled = !!statusQuery.data?.enabled;

  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const startSetup = useAuthedMutation<TotpSetupResponse, void>({
    path: () => "/api/users/me/2fa/setup",
    method: "POST",
  });

  const verify = useAuthedMutation<unknown, { secret: string; code: string }>({
    path: () => "/api/users/me/2fa/verify",
    method: "POST",
    body: (vars) => vars,
    invalidateKeys: [["users", "me", "2fa", "status"]],
  });

  const disable = useAuthedMutation<unknown, void>({
    path: () => "/api/users/me/2fa",
    method: "DELETE",
    invalidateKeys: [["users", "me", "2fa", "status"]],
  });

  const handleStart = async () => {
    setTopError(null);
    try {
      const data = await startSetup.mutateAsync();
      setSetup(data);
      setCode("");
      setSetupError(null);
      setSetupOpen(true);
    } catch (err) {
      logger.warn("2fa_setup_failed", { error: String(err) });
      setTopError("Could not start 2FA setup.");
    }
  };

  const handleVerify = async () => {
    if (!setup) return;
    setSetupError(null);
    try {
      await verify.mutateAsync({ secret: setup.secret, code: code.trim() });
      setSetupOpen(false);
      setSetup(null);
      setCode("");
      await qc.invalidateQueries({ queryKey: ["users", "me", "2fa", "status"] });
    } catch (err) {
      logger.warn("2fa_verify_failed", { error: String(err) });
      setSetupError(
        "Invalid code. Try the next one your authenticator shows.",
      );
    }
  };

  const handleDisable = async () => {
    try {
      await disable.mutateAsync();
    } catch (err) {
      logger.warn("2fa_disable_failed", { error: String(err) });
    }
  };

  const closeSetup = () => {
    setSetupOpen(false);
    setSetup(null);
    setCode("");
    setSetupError(null);
  };

  return (
    <>
      <SectionHeader title="Two-factor authentication" />
      {statusQuery.isLoading ? (
        <Row k="Status" v="Loading…" />
      ) : enabled ? (
        <>
          <Row k="Status" v="Enabled" />
          <Row align="end">
            <ConfirmButton
              className="btn-ghost"
              onConfirm={handleDisable}
              confirmLabel="Really disable 2FA?"
              disabled={disable.isPending}
            >
              Disable 2FA
            </ConfirmButton>
          </Row>
        </>
      ) : (
        <>
          <Row
            k="Status"
            v={
              <span className="auth-2fa-disabled">
                Not enabled — sign-in is password-only.
              </span>
            }
          />
          <Row align="end">
            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              disabled={startSetup.isPending}
            >
              {startSetup.isPending ? "Starting…" : "Set up 2FA"}
            </button>
          </Row>
          {topError && <div className="auth-inline-error">{topError}</div>}
        </>
      )}

      <Modal
        open={setupOpen && !!setup}
        onClose={closeSetup}
        title="Set up two-factor authentication"
        size="md"
      >
        {setup && (
          <div className="auth-2fa-setup">
            <p className="auth-2fa-step">
              1. Scan this QR code in your authenticator app (1Password,
              Aegis, Authy, Google Authenticator…).
            </p>
            <div className="auth-2fa-qr">
              <img
                src={setup.qr_data_url}
                alt="TOTP setup QR code"
                width={220}
                height={220}
              />
            </div>
            <p className="auth-2fa-step">Or enter the secret manually:</p>
            <code className="auth-2fa-secret">{setup.secret}</code>
            <p className="auth-2fa-step">
              2. Enter the 6-digit code your app generates.
            </p>
            <input
              className="auth-2fa-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {setupError && (
              <div className="auth-inline-error">{setupError}</div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={closeSetup}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleVerify}
                disabled={verify.isPending || code.length < 6}
              >
                {verify.isPending ? "Verifying…" : "Verify and enable"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// 4. API tokens
// ────────────────────────────────────────────────────────────────────

function ApiTokensSection() {
  const tokensQuery = useAuthedQuery<ApiTokenListEntry[]>(
    ["users", "me", "api-tokens"],
    "/api/users/me/api-tokens",
  );
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;

  const [showRevoked, setShowRevoked] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [createExpires, setCreateExpires] = useState("");
  const [created, setCreated] = useState<ApiTokenCreateResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useAuthedMutation<
    ApiTokenCreateResponse,
    { label: string; expires_at?: string }
  >({
    path: () => "/api/users/me/api-tokens",
    method: "POST",
    body: (vars) => vars,
  });

  const tokensData = tokensQuery.data;
  const visibleTokens = useMemo(() => {
    const all = tokensData ?? [];
    return showRevoked ? all : all.filter((t) => !t.revoked_at);
  }, [tokensData, showRevoked]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!createLabel.trim()) {
      setCreateError("Label is required.");
      return;
    }
    try {
      const result = await create.mutateAsync({
        label: createLabel.trim(),
        expires_at: createExpires
          ? new Date(`${createExpires}T23:59:59Z`).toISOString()
          : undefined,
      });
      setCreated(result);
      setCreateLabel("");
      setCreateExpires("");
      await qc.invalidateQueries({ queryKey: ["users", "me", "api-tokens"] });
    } catch (err) {
      logger.warn("api_token_create_failed", { error: String(err) });
      setCreateError("Could not create token.");
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.warn("clipboard_copy_failed", { error: String(err) });
    }
  };

  const handleDismiss = () => {
    setCreateOpen(false);
    setCreated(null);
    setCreateLabel("");
    setCreateExpires("");
    setCreateError(null);
    setCopied(false);
  };

  const revoke = async (id: string) => {
    if (!token) return;
    try {
      await apiFetch(
        `/api/users/me/api-tokens/${encodeURIComponent(id)}`,
        token,
        { method: "DELETE" },
      );
      await qc.invalidateQueries({ queryKey: ["users", "me", "api-tokens"] });
    } catch (err) {
      logger.warn("api_token_revoke_failed", { id, error: String(err) });
    }
  };

  return (
    <>
      <SectionHeader
        title="API tokens"
        aux={
          <div className="auth-tokens-aux">
            <label className="auth-tokens-toggle">
              <input
                type="checkbox"
                checked={showRevoked}
                onChange={(e) => setShowRevoked(e.target.checked)}
              />{" "}
              Show revoked
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setCreateOpen(true)}
            >
              Create token
            </button>
          </div>
        }
      />
      {tokensQuery.isLoading ? (
        <div className="muted">Loading tokens…</div>
      ) : visibleTokens.length === 0 ? (
        <div className="muted">No API tokens yet.</div>
      ) : (
        <div className="auth-tokens-list" role="list">
          {visibleTokens.map((t) => (
            <ApiTokenRow key={t.id} token={t} onRevoke={() => revoke(t.id)} />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={handleDismiss}
        title={created ? "Token created" : "Create API token"}
        size="md"
      >
        {!created ? (
          <div className="auth-token-create-form">
            <label className="auth-form-field">
              <span>Label</span>
              <input
                type="text"
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                placeholder="e.g. CI ingest"
                maxLength={120}
                autoFocus
              />
            </label>
            <label className="auth-form-field">
              <span>Expires (optional)</span>
              <input
                type="date"
                value={createExpires}
                onChange={(e) => setCreateExpires(e.target.value)}
              />
            </label>
            {createError && (
              <div className="auth-inline-error">{createError}</div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleDismiss}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreate}
                disabled={create.isPending}
              >
                {create.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-token-created">
            <div className="auth-token-warning">
              Copy this token now. It will <strong>not be shown again</strong>.
              Substrate stores only a hash, so a lost token cannot be
              recovered — only revoked and replaced.
            </div>
            <code className="auth-token-plaintext">{created.token}</code>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCopy}
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDismiss}
              >
                I've saved it
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

interface ApiTokenRowProps {
  token: ApiTokenListEntry;
  onRevoke: () => void;
}

function ApiTokenRow({ token, onRevoke }: ApiTokenRowProps) {
  const isRevoked = !!token.revoked_at;
  return (
    <Row>
      <div className="auth-token-cell">
        <div className="auth-token-name">
          {token.label}
          {isRevoked && <span className="auth-token-badge">revoked</span>}
        </div>
        <div className="auth-token-meta">
          <code className="auth-token-prefix">subs_{token.prefix}…</code>
          <span title={formatAbsolute(token.created_at)}>
            created {formatRelative(token.created_at)}
          </span>
          <span>
            last used{" "}
            {token.last_used_at ? formatRelative(token.last_used_at) : "never"}
          </span>
          <span>expires {formatAbsolute(token.expires_at)}</span>
        </div>
      </div>
      {!isRevoked && (
        <ConfirmButton
          className="btn-ghost auth-token-revoke"
          onConfirm={onRevoke}
          confirmLabel="Revoke?"
        >
          Revoke
        </ConfirmButton>
      )}
    </Row>
  );
}

// ────────────────────────────────────────────────────────────────────
// 5. Devices
// ────────────────────────────────────────────────────────────────────

function DevicesSection() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const currentDeviceId = useSyncSetStore((s) => s.deviceId);
  const { me, meQuery, upsertDevice } = useCurrentUser();
  const qc = useQueryClient();

  const devices: DeviceShape[] = me?.devices ?? [];

  const rename = async (deviceId: string, name: string) => {
    const device = devices.find((d) => d.device_id === deviceId);
    if (!device || !token) return;
    await upsertDevice({
      deviceId,
      label: name,
      last_loaded_sync_ids: device.last_loaded_sync_ids ?? [],
    });
  };

  const forget = async (deviceId: string) => {
    if (!token) return;
    try {
      await apiFetch(
        `/api/users/me/devices/${encodeURIComponent(deviceId)}`,
        token,
        { method: "DELETE" },
      );
      await qc.invalidateQueries({ queryKey: ["users", "me"] });
    } catch (err) {
      logger.warn("forget_device_failed", { deviceId, error: String(err) });
    }
  };

  return (
    <>
      <SectionHeader
        title="Devices"
        aux={meQuery.isLoading ? "Loading…" : `${devices.length} active`}
      />
      {meQuery.isLoading ? (
        <div className="muted">Loading devices…</div>
      ) : devices.length === 0 ? (
        <div className="muted">No devices registered yet.</div>
      ) : (
        <div className="devices-list" role="list">
          {devices.map((d) => (
            <DeviceRow
              key={d.device_id}
              device={d}
              isCurrent={d.device_id === currentDeviceId}
              onRename={(n) => rename(d.device_id, n)}
              onForget={() => forget(d.device_id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
