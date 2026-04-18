import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ModalSize = "sm" | "md" | "lg";

const SIZE_PX: Record<ModalSize, number> = {
  sm: 380,
  md: 520,
  lg: 720,
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: ModalSize;
  /** Override the per-size width. Prefer `size`. */
  maxWidth?: number;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  maxWidth,
}: ModalProps) {
  const width = maxWidth ?? SIZE_PX[size];

  return (
    <Dialog
      open={open}
      // Outside-click on the blurred scrim is intentionally inert —
      // users must use the close button (or Escape, which we still
      // route through onClose for accessibility). The `reason` field
      // tells us how base-ui wants to close the dialog.
      onOpenChange={(v: boolean, details: { reason?: string }) => {
        if (v) return;
        // Outside-click on the blurred scrim is intentionally inert —
        // users must use the close button (or Escape, which we still
        // route through onClose for accessibility).
        if (details?.reason === "outside-press") return;
        onClose();
      }}
    >
      <DialogContent style={{ maxWidth: width }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
