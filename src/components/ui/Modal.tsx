import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export function Modal({ open, onClose, title, children, maxWidth = 480 }: ModalProps) {
  const { isDesktop } = useResponsive();

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
      className="fixed inset-0 z-50 flex justify-center"
      style={{
        background: "var(--overlay-modal)",
        backdropFilter: "blur(var(--overlay-blur))",
        WebkitBackdropFilter: "blur(var(--overlay-blur))",
        animation: "fadeIn 0.15s ease-out both",
        alignItems: isDesktop ? "center" : "flex-end",
      }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          width: "100%",
          maxWidth,
          ...(isDesktop
            ? {
                maxHeight: "calc(100dvh - 120px)",
                borderRadius: "var(--radius-container)",
                boxShadow: "var(--neu-extruded-hover)",
              }
            : {
                height: "100%",
                maxHeight: "100dvh",
                borderRadius: "var(--radius-container) var(--radius-container) 0 0",
                boxShadow: "var(--neu-extruded)",
              }),
          background: "var(--bg-surface)",
          animation: "scaleIn 0.2s ease-out both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 sm:px-7 shrink-0"
          style={{
            height: 60,
            minHeight: 60,
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
            className="neu-btn flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              color: "var(--text-muted)",
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-6 sm:px-7 pb-6"
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
