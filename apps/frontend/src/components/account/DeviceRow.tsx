import { useState } from "react";
import { Row } from "@/components/common/Row";
import { ConfirmButton } from "@/components/common/ConfirmButton";

export interface DeviceShape {
  device_id: string;
  label?: string | null;
  name?: string | null;
  user_agent?: string | null;
  last_loaded_sync_ids?: string[];
  last_seen?: string | null;
  last_seen_at?: string | null;
}

interface Props {
  device: DeviceShape;
  isCurrent: boolean;
  onRename: (newName: string) => void;
  onForget: () => void;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function deviceName(d: DeviceShape): string {
  return d.label || d.name || d.device_id.slice(0, 8);
}

export function DeviceRow({ device, isCurrent, onRename, onForget }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deviceName(device));
  const lastSeen = device.last_seen ?? device.last_seen_at ?? null;

  return (
    <Row>
      <div className="device-cell">
        <div className="device-name">
          {editing ? (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
          ) : (
            <>
              {deviceName(device)}
              {isCurrent && (
                <span className="chip-this-device">this device</span>
              )}
            </>
          )}
        </div>
        <div className="device-meta">
          {device.user_agent ?? ""}
          {lastSeen ? ` · last seen ${formatRelative(lastSeen)}` : ""}
          {device.last_loaded_sync_ids?.length
            ? ` · loaded ${device.last_loaded_sync_ids.length} sync${device.last_loaded_sync_ids.length === 1 ? "" : "s"}`
            : ""}
        </div>
      </div>
      {editing ? (
        <>
          <button
            className="cta-ghost"
            onClick={() => { onRename(draft); setEditing(false); }}
          >
            Save
          </button>
          <button
            className="cta-ghost"
            onClick={() => { setDraft(deviceName(device)); setEditing(false); }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button className="cta-ghost" onClick={() => setEditing(true)}>
            Rename
          </button>
          {isCurrent ? (
            <button className="cta-ghost" disabled>
              Forget
            </button>
          ) : (
            <ConfirmButton
              className="cta-ghost"
              onConfirm={onForget}
              confirmLabel="Forget?"
            >
              Forget
            </ConfirmButton>
          )}
        </>
      )}
    </Row>
  );
}
