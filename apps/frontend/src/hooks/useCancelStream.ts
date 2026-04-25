import { useMutation } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

/**
 * Cancels an in-flight assistant turn by hitting
 * `DELETE /api/chat/streams/{assistant_message_id}`. The backend
 * cancels the asyncio task; the resulting CHAT_TURN_FAILED SSE event
 * with `error: "cancelled"` clears the frontend's streamingTurn slice
 * via the existing useChatStream reducer.
 */
export function useCancelStream() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: (assistantMessageId: string) =>
      apiFetch<null>(
        `/api/chat/streams/${assistantMessageId}`,
        token,
        { method: "DELETE" },
      ),
  });
}
