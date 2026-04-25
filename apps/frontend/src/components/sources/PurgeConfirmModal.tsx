import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  syncIdShort: string;
  isPending: boolean;
}

export function PurgeConfirmModal({ isOpen, onClose, onConfirm, syncIdShort, isPending }: Props) {
  return (
    <Modal open={isOpen} onClose={onClose} title="Purge snapshot" size="sm">
      <div className="purge-confirm-body">
        <p>
          Drop all chunks, embeddings, and graph rows for snapshot{" "}
          <code>{syncIdShort}</code>?
          <br />
          The snapshot row itself will be marked <code>cleaned</code>.{" "}
          <strong>Cannot be undone.</strong>
        </p>
        <div className="modal-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            className="is-destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            Purge
          </Button>
        </div>
      </div>
    </Modal>
  );
}
