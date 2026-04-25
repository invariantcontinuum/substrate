import { useSyncs } from "@/hooks/useSyncs";
import { useToastStore } from "@/stores/toasts";

const UNDO_MS = 5000;

export function useCleanSnapshotWithUndo() {
  const { cleanSync } = useSyncs();
  const push = useToastStore((s) => s.push);

  return (syncId: string) => {
    let cancelled = false;
    push({
      message: `Cleaning snapshot ${syncId.slice(0, 8)}…`,
      ttlMs: UNDO_MS,
      onUndo: () => {
        cancelled = true;
      },
    });
    setTimeout(() => {
      if (cancelled) return;
      void cleanSync(syncId);
    }, UNDO_MS);
  };
}
