import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { openSseClient } from "@/lib/sse";
import { useChatStore } from "@/stores/chat";

interface ChatTurnPayload {
  thread_id: string;
  message_id: string;
  role?: "user" | "assistant";
  delta?: string;
  content?: string;
  citations?: unknown[];
  error?: string;
  evidence?: unknown[];
}

export function useChatStream(threadId: string | null): void {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const setStreamingTurn = useChatStore((s) => s.setStreamingTurn);
  const appendStreamingDelta = useChatStore((s) => s.appendStreamingDelta);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token || !threadId) return;
    const client = openSseClient("/api/events", { token });

    const filterAndDispatch =
      (handler: (p: ChatTurnPayload) => void) =>
      (ev: { payload?: unknown }) => {
        const payload = ev.payload as ChatTurnPayload | undefined;
        if (!payload || payload.thread_id !== threadId) return;
        handler(payload);
      };

    client.on(
      "chat.turn.started",
      filterAndDispatch((payload) => {
        setStreamingTurn({
          threadId: payload.thread_id,
          messageId: payload.message_id,
          content: "",
        });
      }),
    );

    client.on(
      "chat.turn.chunk",
      filterAndDispatch((payload) => {
        if (payload.delta) appendStreamingDelta(payload.delta);
      }),
    );

    client.on(
      "chat.turn.completed",
      filterAndDispatch((payload) => {
        setStreamingTurn(null);
        qc.invalidateQueries({ queryKey: ["chat", "messages", payload.thread_id] });
        qc.invalidateQueries({ queryKey: ["chat", "threads"] });
        // Footer stats (tokens-in/out, duration) are persisted at the
        // tail of stream_turn so we always re-fetch the per-message
        // context snapshot for this assistant id once the turn lands.
        qc.invalidateQueries({
          queryKey: ["chat", "message-context", payload.message_id],
        });
      }),
    );

    client.on(
      "chat.turn.failed",
      filterAndDispatch(() => {
        setStreamingTurn(null);
      }),
    );

    // Evidence is persisted asynchronously after chat.turn.completed; we
    // listen separately so the chip flow doesn't depend on receiving the
    // evidence payload inside the completed event itself. Invalidate
    // both the per-message and per-thread caches so chips light up
    // without the user having to re-open the thread.
    client.on(
      "chat.evidence.collected",
      filterAndDispatch((payload) => {
        qc.invalidateQueries({
          queryKey: ["chat", "message-evidence", payload.message_id],
        });
      }),
    );

    return () => client.close();
  }, [token, threadId, setStreamingTurn, appendStreamingDelta, qc]);
}
