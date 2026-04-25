import { useToastStore } from "@/stores/toasts";

export function ToastDock() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="toast-dock" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-message">{t.message}</span>
          {t.onUndo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                t.onUndo?.();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
