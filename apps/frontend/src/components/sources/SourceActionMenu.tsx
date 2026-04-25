import { useState } from "react";
import { MoreHorizontal, RefreshCw, Edit2, Clock, PauseCircle, Trash2 } from "lucide-react";
import { useSyncs } from "@/hooks/useSyncs";
import { DeleteSourceModal } from "./DeleteSourceModal";

interface Props {
  sourceId: string;
  sourceLabel: string;
}

export function SourceActionMenu({ sourceId, sourceLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { startSync } = useSyncs();
  return (
    <>
      <details
        className="source-action-menu"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary
          className="source-action-menu-summary"
          aria-label="Source actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={14} />
        </summary>
        <ul
          className="source-action-menu-list"
          onClick={(e) => e.stopPropagation()}
        >
          <li>
            <button
              type="button"
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
              disabled
              title="Inline rename — sub-project 6"
            >
              <Edit2 size={12} /> Edit name
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled
              title="Schedule modal — follow-up task"
            >
              <Clock size={12} /> Configure schedule
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled
              title="Pause schedule — follow-up task"
            >
              <PauseCircle size={12} /> Pause schedule
            </button>
          </li>
          <li>
            <button
              type="button"
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
      </details>
      <DeleteSourceModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        sourceId={sourceId}
        sourceLabel={sourceLabel}
      />
    </>
  );
}
