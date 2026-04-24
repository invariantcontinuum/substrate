import { useState } from "react";
import { useSyncSetStore } from "@/stores/syncSet";

const numFmt = new Intl.NumberFormat("en-US");

interface Props {
  nodeCount?: number;
  edgeCount?: number;
}

export function ActiveSetPill({ nodeCount, edgeCount }: Props) {
  const ids = useSyncSetStore((s) => s.syncIds);
  const remove = useSyncSetStore((s) => s.removeSyncId);
  const [open, setOpen] = useState(false);

  const summary = [
    `${ids.length} sync${ids.length === 1 ? "" : "s"}`,
    nodeCount !== undefined ? `${numFmt.format(nodeCount)} nodes` : null,
    edgeCount !== undefined ? `${numFmt.format(edgeCount)} edges` : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <button
        className="active-set-pill"
        onClick={() => setOpen((v) => !v)}
        aria-label="Active sync set"
        aria-expanded={open}
      >
        {summary || "No snapshots loaded"}
      </button>
      {open && (
        <div className="active-set-popover" role="dialog">
          <h4>Loaded in active set</h4>
          {ids.length === 0 && <p className="muted">Select snapshots on the Snapshots tab.</p>}
          <ul>
            {ids.map((id) => (
              <li key={id}>
                <code>{id.slice(0, 8)}</code>
                <button onClick={() => remove?.(id)} className="muted-btn">Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
