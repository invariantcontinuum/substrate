import { useState } from "react";
import { useSyncSetStore } from "@/stores/syncSet";
import { useGraphStore } from "@/stores/graph";

const numFmt = new Intl.NumberFormat("en-US");

/**
 * Top-bar chip showing the live size of the rendered graph slice.
 *
 * Subscribes directly to `useGraphStore.stats` so node/edge counts
 * react to load/unload/active-set changes without the parent having
 * to re-render. Earlier prop-driven design caused stale counts when
 * the canvas reloaded but the parent layout did not.
 */
export function ActiveSetPill() {
  const ids = useSyncSetStore((s) => s.syncIds);
  const remove = useSyncSetStore((s) => s.removeSyncId);
  const nodeCount = useGraphStore((s) => s.stats.nodeCount);
  const edgeCount = useGraphStore((s) => s.stats.edgeCount);
  const [open, setOpen] = useState(false);

  const summary = [
    `${ids.length} sync${ids.length === 1 ? "" : "s"}`,
    nodeCount > 0 ? `${numFmt.format(nodeCount)} nodes` : null,
    edgeCount > 0 ? `${numFmt.format(edgeCount)} edges` : null,
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
