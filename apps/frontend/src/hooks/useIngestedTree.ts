import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";

export type SourceRow    = { source_id: string; name: string };
export type SnapshotRow  = { sync_id: string; created_at: string };
export type FileRow      = { file_id: string; path: string; language: string | null; size_bytes: number | null };
export type CommunityRow = { cache_key: string; community_index: number; label: string; size: number };
export type NodeRow      = { node_id: string; path: string };

export function useSources() {
  const token = useAuthToken();
  return useQuery<SourceRow[]>({
    queryKey: ["picker", "sources"],
    enabled: !!token,
    queryFn: () => apiFetch<SourceRow[]>("/api/chat/picker/sources", token),
  });
}

export function useSnapshots(sourceId: string | null) {
  const token = useAuthToken();
  return useQuery<SnapshotRow[]>({
    queryKey: ["picker", "snapshots", sourceId],
    enabled: !!token && !!sourceId,
    queryFn: () => apiFetch<SnapshotRow[]>(`/api/chat/picker/snapshots?source_id=${sourceId}`, token),
  });
}

export function useDirectories(syncId: string | null, parent: string) {
  const token = useAuthToken();
  return useQuery<string[]>({
    queryKey: ["picker", "dirs", syncId, parent],
    enabled: !!token && !!syncId,
    queryFn: () => apiFetch<string[]>(
      `/api/chat/picker/directories?sync_id=${syncId}&parent=${encodeURIComponent(parent)}`, token,
    ),
  });
}

export function usePickerFiles(syncId: string | null, prefix: string, q: string) {
  const token = useAuthToken();
  return useQuery<FileRow[]>({
    queryKey: ["picker", "files", syncId, prefix, q],
    enabled: !!token && !!syncId,
    queryFn: () => apiFetch<FileRow[]>(
      `/api/chat/picker/files?sync_id=${syncId}&prefix=${encodeURIComponent(prefix)}&q=${encodeURIComponent(q)}`, token,
    ),
  });
}

export function usePickerCommunities(syncId: string | null) {
  const token = useAuthToken();
  return useQuery<CommunityRow[]>({
    queryKey: ["picker", "communities", syncId],
    enabled: !!token && !!syncId,
    queryFn: () => apiFetch<CommunityRow[]>(`/api/chat/picker/communities?sync_id=${syncId}`, token),
  });
}

export function usePickerNodes(syncId: string | null, q: string) {
  const token = useAuthToken();
  return useQuery<NodeRow[]>({
    queryKey: ["picker", "nodes", syncId, q],
    enabled: !!token && !!syncId,
    queryFn: () => apiFetch<NodeRow[]>(`/api/chat/picker/nodes?sync_id=${syncId}&q=${encodeURIComponent(q)}`, token),
  });
}
