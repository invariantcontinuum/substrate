import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";
import { useSyncSetStore } from "@/stores/syncSet";
import { useGraphStore } from "@/stores/graph";
import type { ChatMessage } from "./useChatMessages";
import type { ChatThread } from "./useChatThreads";

interface GraphContext {
  nodes: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ source: string; target: string; type: string }>;
}

function buildGraphContext(): GraphContext | undefined {
  const { nodes, edges, filters } = useGraphStore.getState();
  const visibleNodes = nodes.filter((n) =>
    filters.types.has(String(n.type || "unknown")),
  );
  if (visibleNodes.length === 0) return undefined;

  // Compute degree for each node
  const degree = new Map<string, number>();
  for (const n of visibleNodes) degree.set(n.id, 0);
  for (const e of edges) {
    if (degree.has(e.source)) degree.set(e.source, (degree.get(e.source) || 0) + 1);
    if (degree.has(e.target)) degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  // Take top 60 nodes by degree
  const topNodes = [...visibleNodes]
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    .slice(0, 60);
  const topIds = new Set(topNodes.map((n) => n.id));

  // Build synthetic-id -> uuid map for edge translation
  const idToUuid = new Map<string, string>();
  for (const n of topNodes) {
    idToUuid.set(n.id, n.uuid || n.id);
  }

  // Take edges where both ends are in top nodes, cap at 100
  const topEdges = edges
    .filter((e) => topIds.has(e.source) && topIds.has(e.target))
    .slice(0, 100);

  return {
    nodes: topNodes.map((n) => ({ id: n.uuid || n.id, name: n.name, type: n.type })),
    edges: topEdges.map((e) => ({
      source: idToUuid.get(e.source) || e.source,
      target: idToUuid.get(e.target) || e.target,
      type: e.type,
    })),
  };
}

export function useCreateThread() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: async (title?: string) =>
      apiFetch<ChatThread>("/api/chat/threads", token, {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useRenameThread() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      apiFetch<ChatThread>(`/api/chat/threads/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<null>(`/api/chat/threads/${id}`, token, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export type SendTurnRequest = {
  threadId: string;
  content: string;
  sync_ids?: string[];
  graph_context?: GraphContext | null;
};

export type SendTurnResponse = {
  user_message: ChatMessage;
  status: "streaming";
};

export function useSendTurn() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  const syncIds = useSyncSetStore((s) => s.syncIds);
  return useMutation<
    SendTurnResponse,
    Error,
    SendTurnRequest,
    { previousMessages: ChatMessage[] | undefined; threadId: string }
  >({
    mutationFn: async ({ threadId, content, graph_context }) => {
      const graphContext = graph_context !== undefined ? graph_context : buildGraphContext();
      return apiFetch<SendTurnResponse>(
        `/api/chat/threads/${threadId}/messages`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ content, sync_ids: syncIds, graph_context: graphContext }),
        },
      );
    },
    onMutate: async ({ threadId, content }) => {
      await qc.cancelQueries({ queryKey: ["chat", "messages", threadId] });
      const previousMessages = qc.getQueryData<ChatMessage[]>(["chat", "messages", threadId]);
      const optimisticUserMessage: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content,
        citations: [],
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<ChatMessage[]>(
        ["chat", "messages", threadId],
        (prev) => [...(prev ?? []), optimisticUserMessage],
      );
      return { previousMessages, threadId };
    },
    onError: (_err, _vars, context) => {
      if (context) {
        qc.setQueryData(["chat", "messages", context.threadId], context.previousMessages);
      }
    },
    onSuccess: ({ user_message }, vars) => {
      const { threadId } = vars;
      qc.setQueryData<ChatMessage[]>(
        ["chat", "messages", threadId],
        (prev) => {
          const withoutOptimistic = (prev ?? []).filter(
            (m) => !m.id.startsWith("optimistic-"),
          );
          return [...withoutOptimistic, user_message];
        },
      );
      qc.invalidateQueries({ queryKey: ["chat", "messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    },
  });
}
