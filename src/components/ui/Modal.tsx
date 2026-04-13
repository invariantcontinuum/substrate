import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export function Modal({ open, onClose, title, children, maxWidth = 480 }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent style={maxWidth !== 480 ? { maxWidth } : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
