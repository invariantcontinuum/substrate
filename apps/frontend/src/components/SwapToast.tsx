import { useEffect, useState } from "react";
import { useSyncSetStore } from "@/stores/syncSet";
import { Button } from "@/components/ui/button";

export function SwapToast() {
  const pendingSwap = useSyncSetStore((s) => s.pendingSwap);
  const [, force] = useState(0);

  // Schedule auto-dismiss when pendingSwap appears or changes.
  useEffect(() => {
    if (!pendingSwap) return;
    const remaining = pendingSwap.expiresAt - Date.now();
    if (remaining <= 0) {
      useSyncSetStore.setState({ pendingSwap: null });
      return;
    }
    const t = setTimeout(() => {
      useSyncSetStore.setState({ pendingSwap: null });
      force((n) => n + 1);
    }, remaining);
    return () => clearTimeout(t);
  }, [pendingSwap]);

  if (!pendingSwap) return null;

  return (
    <div className="swap-toast" role="status" aria-live="polite">
      <span>{pendingSwap.sourceLabel} updated to newer snapshot</span>
      <Button onClick={() => useSyncSetStore.getState().undoSwap()}>Undo</Button>
    </div>
  );
}
