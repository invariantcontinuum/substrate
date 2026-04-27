/**
 * Profile tab. Three sections live here:
 *
 *   1. Avatar — upload + inline square-crop via react-image-crop, then
 *      ``POST /api/users/me/avatar`` (multipart). The current avatar is
 *      rendered via ``<img src="/api/users/me/avatar?t=…" />`` with a
 *      404 fallback to the initial-letter ``<Avatar>`` component.
 *      Cache-buster query param flips after each upload so the browser
 *      drops the previous PNG.
 *   2. Profile fields — editable first/last/email/phone with Save +
 *      Reset. Save sends a JSON diff via ``PATCH /api/users/me``; the
 *      gateway forwards to the Keycloak admin API.
 *   3. Preferences — theme + telemetry + IDPs row + danger zone, kept
 *      verbatim from the previous tab.
 *
 * Sign-out / session / device controls live in the Authentication tab
 * (see ``SettingsAuthenticationTab``); they were moved out of Profile
 * during phase D1 so identity-vs.-session concerns don't blur.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Row } from "@/components/common/Row";
import { Avatar } from "@/components/account/Avatar";
import { ConfirmButton } from "@/components/common/ConfirmButton";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useProfileIdps } from "@/hooks/useProfileIdps";
import { useEffectiveConfig } from "@/hooks/useRuntimeConfig";
import { usePreferences } from "@/hooks/usePreferences";
import { usePrefsStore, type ThemePref } from "@/stores/prefs";
import { useToastStore } from "@/stores/toasts";

interface OidcProfile {
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  phone_number?: string;
  attributes?: Record<string, string[] | string | undefined>;
}

interface AuthSection {
  keycloak_account_console_url?: string;
}

interface ProfilePatchResponse {
  id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

interface ProfileFormState {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

const ACCEPT_AVATAR_MIME = "image/png,image/jpeg,image/webp";

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
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

function readPhoneFromProfile(profile: OidcProfile): string {
  // The Keycloak admin API exposes phone as ``attributes.phone[0]``.
  // Keycloak's OIDC ID token may also drop it on the ``phone_number``
  // claim depending on client scope mapping; pick whichever is set.
  const attrs = profile.attributes ?? {};
  const fromAttr = attrs.phone;
  if (Array.isArray(fromAttr) && fromAttr.length > 0) return fromAttr[0] ?? "";
  if (typeof fromAttr === "string") return fromAttr;
  return profile.phone_number ?? "";
}

function seedFormFromProfile(profile: OidcProfile): ProfileFormState {
  const fullName = profile.name ?? "";
  const [splitFirst = "", ...rest] = fullName.split(" ");
  const splitLast = rest.join(" ");
  return {
    first_name: profile.given_name ?? splitFirst,
    last_name: profile.family_name ?? splitLast,
    email: profile.email ?? "",
    phone: readPhoneFromProfile(profile),
  };
}

function diffPatch(
  initial: ProfileFormState,
  current: ProfileFormState,
): Partial<ProfileFormState> {
  const out: Partial<ProfileFormState> = {};
  (Object.keys(current) as Array<keyof ProfileFormState>).forEach((k) => {
    if (current[k] !== initial[k]) out[k] = current[k];
  });
  return out;
}

export function AccountProfileTab() {
  // Hydrate prefs (theme/telemetry persistence). Safe to call multiple
  // times — the hook short-circuits once the store has been hydrated.
  usePreferences();
  const auth = useAuth();
  const token = useAuthToken();
  const profile = (auth.user?.profile ?? {}) as OidcProfile;
  const displayName =
    profile.name
    ?? [profile.given_name, profile.family_name].filter(Boolean).join(" ")
    ?? profile.preferred_username;
  const email = profile.email;

  const { idps } = useProfileIdps();
  const { config: authConfig } = useEffectiveConfig<AuthSection>("auth");
  const accountConsoleUrl = authConfig.keycloak_account_console_url;

  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  const telemetry = usePrefsStore((s) => s.telemetry);
  const setTelemetry = usePrefsStore((s) => s.setTelemetry);
  const pushToast = useToastStore((s) => s.push);

  // ── Avatar ────────────────────────────────────────────────────────
  // Cache-buster on the <img> src — bumped after every successful
  // upload/delete so the browser drops the previous PNG.
  const [avatarBust, setAvatarBust] = useState<number>(() => Date.now());
  const [hasAvatar, setHasAvatar] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const [pickedSrc, setPickedSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [uploading, setUploading] = useState(false);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onFileSelected(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPickedSrc(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  function onCropImageLoad(ev: React.SyntheticEvent<HTMLImageElement>) {
    const img = ev.currentTarget;
    const initial = centerCrop(
      makeAspectCrop(
        { unit: "%", width: 80 },
        1,
        img.width,
        img.height,
      ),
      img.width,
      img.height,
    );
    setCrop(initial);
  }

  async function cropToBlob(): Promise<Blob | null> {
    const img = cropImgRef.current;
    const c = completedCrop;
    if (!img || !c || c.width === 0 || c.height === 0) return null;
    // Convert the visible (rendered) crop rect into source-image pixels
    // so the canvas captures the full-resolution region. The server
    // re-crops + resizes regardless, but feeding it native resolution
    // avoids round-tripping a blurry preview.
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(c.width * scaleX);
    canvas.height = Math.round(c.height * scaleY);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      c.x * scaleX,
      c.y * scaleY,
      c.width * scaleX,
      c.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
  }

  async function uploadAvatar() {
    if (!token || uploading) return;
    setUploading(true);
    try {
      const blob = await cropToBlob();
      if (!blob) {
        pushToast({ message: "Could not encode crop", ttlMs: 4000 });
        return;
      }
      const fd = new FormData();
      fd.append("file", blob, "avatar.png");
      const resp = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!resp.ok) {
        throw new Error(`upload failed ${resp.status}`);
      }
      setPickedSrc(null);
      setCompletedCrop(null);
      setAvatarBust(Date.now());
      setHasAvatar(true);
      pushToast({ message: "Avatar updated", ttlMs: 3000 });
    } catch (err) {
      logger.warn("avatar_upload_failed", { error: String(err) });
      pushToast({ message: "Avatar upload failed", ttlMs: 4000 });
    } finally {
      setUploading(false);
    }
  }

  function cancelCrop() {
    setPickedSrc(null);
    setCompletedCrop(null);
  }

  async function deleteAvatar() {
    if (!token) return;
    try {
      await apiFetch("/api/users/me/avatar", token, { method: "DELETE" });
      setHasAvatar(false);
      setAvatarBust(Date.now());
      pushToast({ message: "Avatar removed", ttlMs: 3000 });
    } catch (err) {
      logger.warn("avatar_delete_failed", { error: String(err) });
      pushToast({ message: "Avatar delete failed", ttlMs: 4000 });
    }
  }

  // ── Profile fields (PATCH /api/users/me) ──────────────────────────
  const initialForm = seedFormFromProfile(profile);
  const [form, setForm] = useState<ProfileFormState>(initialForm);
  // Re-seed when the OIDC profile changes (e.g. after token refresh).
  // We compare values JSON-stringified instead of identity because
  // ``auth.user.profile`` is rebuilt on every refresh.
  const initialKey = JSON.stringify(initialForm);
  const [seedKey, setSeedKey] = useState<string>(initialKey);
  useEffect(() => {
    if (seedKey !== initialKey) {
      setForm(initialForm);
      setSeedKey(initialKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const [savingProfile, setSavingProfile] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  function updateField<K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    if (!token || savingProfile || !dirty) return;
    const patch = diffPatch(initialForm, form);
    if (Object.keys(patch).length === 0) return;
    setSavingProfile(true);
    try {
      const updated = await apiFetch<ProfilePatchResponse>(
        "/api/users/me",
        token,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );
      // Re-seed with the server's authoritative response so the next
      // diff computes against the truth (handles email re-verify edge
      // cases where Keycloak refuses the change silently).
      setForm({
        first_name: updated.first_name ?? form.first_name,
        last_name: updated.last_name ?? form.last_name,
        email: updated.email ?? form.email,
        phone: updated.phone ?? form.phone,
      });
      pushToast({ message: "Profile saved", ttlMs: 3000 });
    } catch (err) {
      logger.warn("profile_patch_failed", { error: String(err) });
      pushToast({ message: "Save failed — check fields", ttlMs: 4000 });
    } finally {
      setSavingProfile(false);
    }
  }

  function resetProfile() {
    setForm(initialForm);
  }

  // ── Danger zone ──────────────────────────────────────────────────
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
        <div className="profile-avatar-wrap">
          {hasAvatar ? (
            // Bearer auth on the avatar endpoint forces us to render
            // through fetch+blob rather than the native <img src> path,
            // since the browser doesn't attach the JWT automatically.
            // We fall back to the initial-letter Avatar on any error.
            <AvatarImage
              token={token}
              bust={avatarBust}
              fallbackName={displayName ?? null}
              fallbackEmail={email ?? null}
              onMissing={() => setHasAvatar(false)}
            />
          ) : (
            <Avatar name={displayName} email={email} />
          )}
        </div>
        <div>
          <div className="profile-name">{displayName ?? "—"}</div>
          <div className="profile-email">{email ?? "—"}</div>
        </div>
        <div className="profile-avatar-actions">
          <button type="button" className="btn-secondary" onClick={openFilePicker}>
            Upload
          </button>
          {hasAvatar && (
            <button type="button" className="btn-ghost" onClick={deleteAvatar}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_AVATAR_MIME}
          style={{ display: "none" }}
          onChange={onFileSelected}
        />
      </div>

      {pickedSrc && (
        <div className="avatar-crop-overlay">
          <div className="avatar-crop-card">
            <h4 className="avatar-crop-card__title">Crop avatar</h4>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
              keepSelection
            >
              <img
                ref={cropImgRef}
                src={pickedSrc}
                alt="Crop source"
                onLoad={onCropImageLoad}
                style={{ maxWidth: "100%", maxHeight: "60vh" }}
              />
            </ReactCrop>
            <div className="avatar-crop-card__actions">
              <button
                type="button"
                className="btn-primary"
                onClick={uploadAvatar}
                disabled={uploading || !completedCrop}
              >
                {uploading ? "Saving…" : "Save avatar"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={cancelCrop}
                disabled={uploading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionHeader title="Account" />
      <Row
        k="First name"
        v={
          <input
            type="text"
            value={form.first_name}
            onChange={(e) => updateField("first_name", e.target.value)}
          />
        }
      />
      <Row
        k="Last name"
        v={
          <input
            type="text"
            value={form.last_name}
            onChange={(e) => updateField("last_name", e.target.value)}
          />
        }
      />
      <Row
        k="Email"
        v={
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
          />
        }
      />
      <Row
        k="Phone"
        v={
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
          />
        }
      />
      <Row align="end">
        <button
          type="button"
          className="btn-primary"
          onClick={saveProfile}
          disabled={!dirty || savingProfile}
        >
          {savingProfile ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={resetProfile}
          disabled={!dirty || savingProfile}
        >
          Reset
        </button>
      </Row>

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
              className="btn-ghost"
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

      <SectionHeader title="Danger zone" />
      <Row danger align="end">
        <ConfirmButton
          onConfirm={requestDelete}
          className="btn-ghost"
          confirmLabel="Request account deletion?"
        >
          Delete account data
        </ConfirmButton>
      </Row>
    </>
  );
}

interface AvatarImageProps {
  token: string | undefined;
  bust: number;
  fallbackName: string | null;
  fallbackEmail: string | null;
  onMissing: () => void;
}

/**
 * Render the user's avatar from ``GET /api/users/me/avatar``.
 *
 * We can't use a native ``<img src="/api/users/me/avatar">`` because
 * the gateway requires a bearer token on every API route, and the
 * browser doesn't propagate ``Authorization`` for plain image loads.
 * The component fetches the PNG with the JWT, materialises a blob URL,
 * and revokes it when the avatar refreshes (cache-buster bump) or the
 * component unmounts. A 404 surfaces back to the parent via
 * ``onMissing()`` so it can drop back to the initial-letter Avatar.
 */
function AvatarImage({
  token,
  bust,
  fallbackName,
  fallbackEmail,
  onMissing,
}: AvatarImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const onMissingRef = useRef(onMissing);
  // Refresh the latched callback inside an effect so we don't write to
  // ``ref.current`` during render (react-hooks/refs lint rule).
  useEffect(() => {
    onMissingRef.current = onMissing;
  }, [onMissing]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let active: string | null = null;
    (async () => {
      try {
        const resp = await fetch(`/api/users/me/avatar?t=${bust}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          if (resp.status === 404) onMissingRef.current();
          return;
        }
        const blob = await resp.blob();
        if (cancelled) return;
        active = URL.createObjectURL(blob);
        setSrc(active);
      } catch (err) {
        logger.warn("avatar_fetch_failed", { error: String(err) });
        onMissingRef.current();
      }
    })();
    return () => {
      cancelled = true;
      if (active) URL.revokeObjectURL(active);
    };
  }, [token, bust]);

  if (!src) {
    return <Avatar name={fallbackName} email={fallbackEmail} />;
  }
  return <img className="avatar-image" src={src} alt="avatar" />;
}
