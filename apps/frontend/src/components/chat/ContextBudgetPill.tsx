import { useMemo } from "react";
import { useThreadContextFiles } from "@/hooks/useThreadContextFiles";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatContextStore } from "@/stores/chatContext";

const BUDGET = 24000;
/**
 * Per-file metadata overhead. With Phase 6's description-based retrieval
 * the LLM no longer receives full file content — it gets a short
 * description (≈64 tokens) plus path + language + size as scaffolding
 * (≈32 tokens). We bake the headroom in here as a single constant so a
 * deployer wanting to tune the pill semantics can adjust this knob in
 * one place. The actual budget enforcement still happens server-side
 * inside chat_pipeline.
 */
const PER_FILE_OVERHEAD = 96;
const RECENT_HISTORY_TURNS = 16;

/**
 * Composer-adjacent budget pill. Estimates how much of the 24k context
 * window the next turn is going to consume so the user can prune files
 * before sending. The estimate is intentionally fast/heuristic (no
 * round-trip): we use a per-file metadata overhead because the
 * description-based retrieval pipeline doesn't ship full file content
 * to the LLM, plus the recent-history character count divided by 4 as
 * a rough char→token approximation.
 *
 * The pill turns amber at 80% of budget, red over budget — same colour
 * coding the previous full-content version used so muscle memory carries
 * through the redesign.
 */
export function ContextBudgetPill({
  threadId,
  onOpenModal,
}: {
  threadId: string | null;
  onOpenModal: () => void;
}) {
  const { data } = useThreadContextFiles(threadId);
  const { data: messages } = useChatMessages(threadId);
  // When threadId is null (brand-new chat with no first turn yet) or the
  // thread has no per-thread context files (retrieval hasn't fired yet),
  // fall back to the user's active chat-context so the pill reflects
  // the *planned* scope. Subscribing to the Zustand store gets us
  // realtime updates the moment the user applies a new selection in
  // Settings → Chat Context — no remount needed.
  const activeContext = useChatContextStore((s) => s.active);

  const used = useMemo(() => {
    if (!data) return 0;
    const includedFiles = data.files.filter((f) => f.included);
    const fileTokens = includedFiles.length * PER_FILE_OVERHEAD;
    // Tail-end of the active history; superseded rows are dropped from
    // the prompt server-side, so we mirror that here so the pill agrees
    // with what the LLM will actually receive.
    const recent = (messages ?? [])
      .filter((m) => !m.superseded_by)
      .slice(-RECENT_HISTORY_TURNS);
    let historyTokens = 0;
    for (const m of recent) {
      historyTokens += Math.ceil((m.content?.length ?? 0) / 4);
    }
    return fileTokens + historyTokens;
  }, [data, messages]);

  // Always render so the user sees the ceiling before sending a turn —
  // even on a brand-new thread (threadId still null) or when no files
  // have been attached yet (file_count = 0). The pill is the single
  // affordance into the context-files modal.
  const threadFileCount = data?.totals.file_count ?? 0;
  const snapshotCount = activeContext?.sync_ids?.length ?? 0;
  const communityCount = activeContext?.community_ids?.length ?? 0;
  // Choose the label that best describes the scope the next turn will
  // pull from. Prefer the thread's actual attached files (concrete);
  // fall back to the live chat-context summary (planned).
  const useThreadShape = threadFileCount > 0;
  const tail = useThreadShape
    ? `${threadFileCount} file${threadFileCount === 1 ? "" : "s"}`
    : snapshotCount > 0
      ? `${snapshotCount} snapshot${snapshotCount === 1 ? "" : "s"}${
          communityCount > 0
            ? ` · ${communityCount} comm${communityCount === 1 ? "" : "s"}`
            : ""
        }`
      : "no context";
  const ratio = used / BUDGET;
  const cls = ratio > 1 ? "is-over" : ratio > 0.8 ? "is-warn" : "";
  return (
    <button
      type="button"
      className={`context-budget-pill ${cls}`}
      onClick={onOpenModal}
      title={
        threadId
          ? "Open context files"
          : "Open Settings → Chat Context to change the scope of new chats."
      }
    >
      {used.toLocaleString()} / {BUDGET.toLocaleString()} tokens · {tail}
    </button>
  );
}
