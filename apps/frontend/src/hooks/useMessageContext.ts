import { useAuthedQuery } from "./useAuthedQuery";

/**
 * Read-only snapshot of what was sent to the LLM for a given assistant
 * turn. Persisted by ``chat_pipeline`` into ``chat_message_context`` and
 * exposed via ``GET /api/chat/messages/{id}/context``.
 *
 * The footer renders the three numeric stats (tokens-in, tokens-out,
 * duration); the View context modal renders the system prompt, history
 * trace, and file metadata. Every caller goes through this hook so the
 * cache key shape stays consistent across consumers.
 */

export interface MessageContextHistoryItem {
  role: string;
  content: string;
}

export interface MessageContextFile {
  file_id: string | null;
  filepath: string | null;
  language: string | null;
  type: string | null;
  size_bytes: number | null;
  description: string | null;
}

export interface MessageContext {
  system_prompt: string;
  history: MessageContextHistoryItem[];
  files: MessageContextFile[];
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
}

export function useMessageContext(messageId: string | null | undefined) {
  return useAuthedQuery<MessageContext>(
    ["chat", "message-context", messageId ?? ""],
    `/api/chat/messages/${messageId ?? ""}/context`,
    {
      enabled: !!messageId,
      // Context is immutable per assistant turn — once persisted it never
      // changes, so we lean into a long stale window to avoid round-trips
      // when the user re-opens the modal.
      staleTime: 5 * 60_000,
    },
  );
}
