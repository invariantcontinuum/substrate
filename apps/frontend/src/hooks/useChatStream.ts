import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useQueryClient } from "@tanstack/react-query";
import { openSseClient } from "substrate-web-common";
import { useChatStore } from "@/stores/chat";

interface ChatTurnPayload {
  thread_id: string;
  message_id: string;
  role?: "user" | "assistant";
  delta?: string;
  content?: string;
  citations?: unknown[];
  error?: string;
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
      }),
    );

    client.on(
      "chat.turn.failed",
      filterAndDispatch(() => {
        setStreamingTurn(null);
      }),
    );

    return () => client.close();
  }, [token, threadId, setStreamingTurn, appendStreamingDelta, qc]);
}
