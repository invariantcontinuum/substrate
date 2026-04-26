import { useAuthedMutation } from "./useAuthedMutation";

/**
 * Mutations that target an individual chat message — edit (replace a
 * user-turn and re-roll the assistant reply) and regenerate (re-roll the
 * assistant reply that follows a user-turn). Both share the 202 streaming
 * envelope from ``POST /api/chat/threads/{id}/messages``; the SSE turn
 * sequence then carries the new assistant reply through ``useChatStream``.
 *
 * Invalidating the ``chat.messages`` cache on success forces the next
 * thread render to re-fetch the message list so the new user-turn (for
 * edit) or new assistant-turn (for regenerate) shows up alongside its
 * superseded predecessors.
 */

export interface EditMessageResponse {
  user_message_id: string;
  assistant_message_id: string;
  supersedes: string;
  status: "streaming";
}

export interface RegenerateMessageResponse {
  assistant_message_id: string;
  supersedes: string | null;
  status: "streaming";
}

export function useEditMessage() {
  return useAuthedMutation<EditMessageResponse, { message_id: string; content: string }>({
    path: () => "/api/chat/messages/edit",
    method: "POST",
    body: (vars) => ({ message_id: vars.message_id, content: vars.content }),
    invalidateKeys: [["chat", "messages"]],
  });
}

export function useRegenerateMessage() {
  return useAuthedMutation<RegenerateMessageResponse, { message_id: string }>({
    path: () => "/api/chat/messages/regenerate",
    method: "POST",
    body: (vars) => ({ message_id: vars.message_id }),
    invalidateKeys: [["chat", "messages"]],
  });
}
