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
  /** Extra class applied to the glass panel. Use for per-modal opacity
   *  or background overrides (e.g. the file viewer wants more opacity
   *  than a search dialog). */
  contentClassName?: string;
  /** Drop the default `.modal-body` padding. Use when the modal renders
   *  its own layout chrome (e.g. settings sidebar/content split, file
   *  viewer scroller). */
  bodyFlush?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  maxWidth,
  contentClassName,
  bodyFlush = false,
}: ModalProps) {
  const width = maxWidth ?? SIZE_PX[size];
  const bodyClass = `modal-body${bodyFlush ? " modal-body--flush" : ""}`;

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
      <DialogContent style={{ maxWidth: width }} className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className={bodyClass}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
