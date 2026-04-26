import { useAuthedQuery } from "./useAuthedQuery";

/**
 * Per-assistant-turn evidence list. Backed by chat_message_evidence rows
 * that the pipeline writes when the model invokes the cite_evidence
 * tool (or emits a ``[CITE …]`` inline fallback marker). The chat footer
 * renders one EvidenceChip per row.
 *
 * The chat SSE stream emits ``chat.evidence.collected`` after the turn
 * completes, which ``useChatStream`` uses to invalidate this cache so
 * fresh evidence pops in without a full thread re-fetch.
 */

export interface Evidence {
  id: string;
  filepath: string;
  start_line: number;
  end_line: number;
  reason: string;
}

export interface EvidenceResponse {
  evidence: Evidence[];
}

export function useMessageEvidence(messageId: string | null | undefined) {
  const q = useAuthedQuery<EvidenceResponse>(
    ["chat", "message-evidence", messageId ?? ""],
    `/api/chat/messages/${messageId ?? ""}/evidence`,
    {
      enabled: !!messageId,
      staleTime: 30_000,
    },
  );
  return { evidence: q.data?.evidence ?? [], isLoading: q.isLoading };
}
