import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { useDeleteSource } from "@/hooks/useDeleteSource";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceId: string;
  sourceLabel: string;
}

export function DeleteSourceModal({ isOpen, onClose, sourceId, sourceLabel }: Props) {
  const [typed, setTyped] = useState("");
  const del = useDeleteSource();
  const ready = typed.trim() === sourceLabel;
  return (
    <Modal open={isOpen} onClose={onClose} title="Delete source" size="sm">
      <div className="delete-source-modal-body">
        <p>
          This drops <strong>{sourceLabel}</strong>, all its snapshots,
          embeddings, chunks, and chat-thread context references.
          <br />
          <strong>Cannot be undone.</strong>
        </p>
        <label className="delete-source-modal-label">
          Type <code>{sourceLabel}</code> to confirm:
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={sourceLabel}
            autoFocus
            className="delete-source-modal-input"
          />
        </label>
        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            className="is-destructive"
            disabled={!ready || del.isPending}
            onClick={async () => {
              await del.mutateAsync(sourceId);
              setTyped("");
              onClose();
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
