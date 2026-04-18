// frontend/src/components/SyncAlreadyActiveNotice.tsx
import React from "react";

interface Props {
  syncId: string;
  onOpenSync?: (syncId: string) => void;
  className?: string;
}

export function SyncAlreadyActiveNotice({ syncId, onOpenSync, className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        className ??
        "rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700 px-3 py-2 text-sm flex items-center justify-between gap-3"
      }
    >
      <span>A sync is already running for this source.</span>
      {onOpenSync && (
        <button
          type="button"
          aria-label="View the already-running sync"
          onClick={() => onOpenSync(syncId)}
          className="underline underline-offset-2 hover:no-underline text-amber-900 dark:text-amber-200 shrink-0"
        >
          View it
        </button>
      )}
    </div>
  );
}
