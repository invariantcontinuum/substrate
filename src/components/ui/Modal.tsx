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
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center"
      style={{
        background: "var(--overlay-modal)",
        backdropFilter: "blur(var(--overlay-blur))",
        WebkitBackdropFilter: "blur(var(--overlay-blur))",
        animation: "fadeIn 0.15s ease-out both",
        padding: "0",
      }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          width: "100%",
          maxWidth,
          height: "100%",
          maxHeight: "100dvh",
          background: "var(--bg-surface)",
          border: "none",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          animation: "scaleIn 0.2s ease-out both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 sm:px-5 shrink-0"
          style={{
            height: 48,
            minHeight: 48,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="text-[13px] font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 28,
              height: 28,
              color: "var(--text-muted)",
              background: "var(--bg-hover)",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-5 py-4"
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
