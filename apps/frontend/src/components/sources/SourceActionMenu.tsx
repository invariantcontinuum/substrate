import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, RefreshCw, Edit2, Clock, PauseCircle, Trash2 } from "lucide-react";
import { useSyncs } from "@/hooks/useSyncs";
import { DeleteSourceModal } from "./DeleteSourceModal";

interface Props {
  sourceId: string;
  sourceLabel: string;
}

/**
 * Source row's "⋯" action menu. Controlled component (no native
 * <details>) so we can dismiss on outside clicks and Escape — the
 * native fallback never closed when the user clicked elsewhere.
 */
export function SourceActionMenu({ sourceId, sourceLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { startSync } = useSyncs();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape dismissal. Listeners are attached only
  // while the menu is open so we don't pay for them on every row.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (event.target instanceof Node && node.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="source-action-menu" ref={containerRef}>
        <button
          type="button"
          className="source-action-menu-summary"
          aria-label="Source actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <MoreHorizontal size={14} />
        </button>
        {open && (
          <ul
            className="source-action-menu-list"
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void startSync({ source_id: sourceId });
                  setOpen(false);
                }}
              >
                <RefreshCw size={12} /> Sync now
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled
                title="Inline rename — sub-project 6"
              >
                <Edit2 size={12} /> Edit name
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled
                title="Schedule modal — follow-up task"
              >
                <Clock size={12} /> Configure schedule
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled
                title="Pause schedule — follow-up task"
              >
                <PauseCircle size={12} /> Pause schedule
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                className="is-destructive"
                onClick={() => {
                  setDeleteOpen(true);
                  setOpen(false);
                }}
              >
                <Trash2 size={12} /> Delete source
              </button>
            </li>
          </ul>
        )}
      </div>
      <DeleteSourceModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        sourceId={sourceId}
        sourceLabel={sourceLabel}
      />
    </>
  );
}
