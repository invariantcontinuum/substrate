import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { Moon, Save, Sun } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { useSyncSetStore } from "@/stores/syncSet";
import { useThemeStore } from "@/stores/theme";
import { useUIStore } from "@/stores/ui";

type Tab = "account" | "settings" | "devices";

export function UserModal() {
  const { activeModal, closeModal } = useUIStore();
  const auth = useAuth();
  const { theme, setTheme } = useThemeStore();
  const { me, patchMe, patchMeState, upsertDevice, upsertDeviceState } = useCurrentUser();
  const [tab, setTab] = useState<Tab>("account");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [deviceLabelDraft, setDeviceLabelDraft] = useState("");

  const profile = auth.user?.profile;
  const username = (profile?.preferred_username as string) || "User";
  const email = (profile?.email as string) || "";

  const deviceId = useSyncSetStore((s) => s.deviceId);
  const loadedSyncIds = useSyncSetStore((s) => s.syncIds);
  const setActiveSet = useSyncSetStore((s) => s.setActiveSet);

  useEffect(() => {
    if (!me?.profile) return;
    const name = me.profile.display_name || me.profile.preferred_username || "";
    const current = me.devices.find((d) => d.device_id === deviceId);
    const label = current?.label || "";
    queueMicrotask(() => {
      setDisplayNameDraft(name);
      setDeviceLabelDraft(label);
    });
  }, [me, deviceId]);

  const role = me?.profile.role || "viewer";
  const userSub = me?.profile.user_sub || (profile?.sub as string) || "";

  return (
    <Modal open={activeModal === "user"} onClose={closeModal} title="Account" maxWidth={460}>
      <div className="user-modal-tabs">
        <button
          type="button"
          className={`user-modal-tab${tab === "account" ? " is-active" : ""}`}
          onClick={() => setTab("account")}
        >
          Account
        </button>
        <button
          type="button"
          className={`user-modal-tab${tab === "settings" ? " is-active" : ""}`}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
        <button
          type="button"
          className={`user-modal-tab${tab === "devices" ? " is-active" : ""}`}
          onClick={() => setTab("devices")}
        >
          Devices
        </button>
      </div>

      {tab === "account" ? (
        <div className="settings-modal">
          <div className="user-modal">
            <div className="user-modal-avatar">{username.charAt(0).toUpperCase()}</div>
            <div className="user-modal-info">
              <div className="user-modal-name">{displayNameDraft || username}</div>
              {email && <div>{email}</div>}
              <div className="muted">Role: {role}</div>
            </div>
          </div>

          <div>
            <Label htmlFor="display-name">Display Name</Label>
            <input
              id="display-name"
              className="top-nav-search-input"
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              placeholder="Display name"
            />
          </div>

          <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
            User ID: {userSub || "unknown"}
          </div>

          <div className="settings-modal-themes">
            <Button
              disabled={patchMeState.isPending}
              onClick={() => patchMe({ display_name: displayNameDraft.trim() || username })}
            >
              <Save size={14} />
              Save Profile
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="settings-modal">
          <div>
            <Label>Theme</Label>
            <div className="settings-modal-themes" role="radiogroup" aria-label="Color theme">
              {(["light", "dark"] as const).map((t) => {
                const active = theme === t;
                const Icon = t === "dark" ? Moon : Sun;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(t)}
                    className={`theme-option${active ? " is-active" : ""}`}
                  >
                    <span className="theme-option-icon" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <span className="theme-option-label">{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                    {active && <span className="theme-option-check" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Local Snapshot Context</Label>
            <div className="muted" style={{ marginTop: 6 }}>
              This browser/device stores last loaded snapshots locally per user.
            </div>
            <Button
              onClick={() => {
                setActiveSet([]);
                void upsertDevice({ deviceId, label: deviceLabelDraft, last_loaded_sync_ids: [] });
              }}
              style={{ marginTop: 10 }}
            >
              Clear This Device Snapshots
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "devices" ? (
        <div className="settings-modal">
          <div>
            <Label htmlFor="device-label">Current Device Label</Label>
            <input
              id="device-label"
              className="top-nav-search-input"
              value={deviceLabelDraft}
              onChange={(e) => setDeviceLabelDraft(e.target.value)}
              placeholder="e.g. Work Laptop"
            />
            <div className="muted" style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
              Device ID: {deviceId}
            </div>
          </div>

          <Button
            disabled={upsertDeviceState.isPending}
            onClick={() =>
              upsertDevice({
                deviceId,
                label: deviceLabelDraft.trim(),
                last_loaded_sync_ids: loadedSyncIds,
              })
            }
          >
            <Save size={14} />
            Sync Device Context
          </Button>

          <div>
            <Label>Known Devices</Label>
            <div className="sources-sidebar-list" style={{ maxHeight: 180, marginTop: 8 }}>
              {(me?.devices ?? []).map((d) => (
                <div key={d.device_id} className="source-list-item" style={{ marginBottom: 8 }}>
                  <div className="source-list-item-main">
                    <div className="source-list-item-title">
                      {d.label || "Unnamed device"}
                      {d.device_id === deviceId ? " (current)" : ""}
                    </div>
                    <div className="source-list-item-sub">
                      {d.last_loaded_sync_ids.length} loaded snapshot{d.last_loaded_sync_ids.length === 1 ? "" : "s"}
                      {" · "}
                      Last seen {new Date(d.last_seen_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {(me?.devices ?? []).length === 0 && (
                <div className="muted">No synced device records yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

