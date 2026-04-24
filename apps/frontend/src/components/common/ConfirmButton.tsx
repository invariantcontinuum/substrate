import { useState, type ReactNode } from "react";

interface Props {
  onConfirm: () => void;
  confirmLabel?: ReactNode;
  children: ReactNode;
  windowMs?: number;
  className?: string;
  disabled?: boolean;
}

export function ConfirmButton({
  onConfirm,
  confirmLabel = "Confirm?",
  children,
  windowMs = 3500,
  className,
  disabled,
}: Props) {
  const [armed, setArmed] = useState(false);
  const onClick = () => {
    if (disabled) return;
    if (armed) {
      onConfirm();
      setArmed(false);
      return;
    }
    setArmed(true);
    setTimeout(() => setArmed(false), windowMs);
  };
  return (
    <button
      className={`${className ?? ""} ${armed ? "is-armed" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
