import { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export function Modal({ open, onClose, title, children, maxWidth = 480 }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "var(--overlay-modal)",
        backdropFilter: "blur(var(--overlay-blur))",
        WebkitBackdropFilter: "blur(var(--overlay-blur))",
        animation: "fadeIn 0.15s ease-out both",
      }}
      onClick={onClose}
    >
      <div
        className="rounded-xl overflow-hidden flex flex-col"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "80vh",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          animation: "scaleIn 0.2s ease-out both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
