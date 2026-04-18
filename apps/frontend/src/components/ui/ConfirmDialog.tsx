import { Modal } from "./Modal";
import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "neutral";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "neutral",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="confirm-dialog-body">{body}</div>
      <div className="confirm-dialog-actions">
        <Button onClick={() => onCancel()}>{cancelLabel}</Button>
        <Button
          onClick={() => onConfirm()}
          className={variant === "danger" ? "danger" : ""}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
