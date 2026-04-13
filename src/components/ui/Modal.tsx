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
      className="fixed inset-0 z-50 flex justify-center items-center"
      style={{
        background: "var(--overlay-modal)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "fadeIn 0.15s ease-out both",
      }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "calc(100dvh - 120px)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
          background: "var(--bg-elevated)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--border)",
          animation: "scaleIn 0.2s ease-out both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-7 sm:px-8 shrink-0"
          style={{
            height: 44,
            minHeight: 44,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            className="text-[14px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              color: "var(--text-muted)",
              background: "var(--bg-hover)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-7 sm:px-8 pt-1 pb-7"
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
