import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "./useAuthToken";
import { useSyncSetStore } from "@/stores/syncSet";

/**
 * Locate a file by its repo-relative path within the user's currently
 * loaded sync set, then GET its full content for inline preview.
 *
 * The chat-evidence chip carries only ``filepath`` (not file_id) because
 * the cite_evidence tool reasons about paths, not opaque DB ids. The
 * ``/api/files`` list endpoint returns ``{id, filepath, ...}`` for every
 * file in the active syncs; this hook resolves the path to the first
 * matching id and pipes that into the existing
 * ``/api/files/{file_id}/content`` reconstruction route.
 *
 * When no sync_ids are loaded or the file isn't present in any of them,
 * the inner content query is disabled and the modal renders a "file not
 * available in current syncs" message.
 */

export interface FileListItem {
  id: string;
  filepath: string;
  name: string;
  type: string;
  domain: string;
  language: string | null;
  size_bytes: number | null;
}

interface FileListResponse {
  files: FileListItem[];
}

export interface FileContentResponse {
  file_id: string;
  path: string;
  language: string | null;
  content: string;
  total_lines: number | null;
}

export function useFileByPath(filepath: string | null) {
  const token = useAuthToken();
  const syncIds = useSyncSetStore((s) => s.syncIds);

  // Step 1 — list files in the current sync set; return the matching row
  // if any. The list endpoint already filters by sources.user_sub, so
  // we never see a foreign user's files even if the sync_ids cookie is
  // tampered with.
  const listQuery = useQuery<FileListResponse>({
    queryKey: ["files", "by-path", "list", syncIds.join(","), filepath],
    queryFn: () =>
      apiFetch<FileListResponse>(
        `/api/files?sync_ids=${encodeURIComponent(syncIds.join(","))}`,
        token,
      ),
    enabled: !!token && !!filepath && syncIds.length > 0,
    staleTime: 60_000,
  });

  const matched = listQuery.data?.files.find((f) => f.filepath === filepath) ?? null;

  // Step 2 — once we have a file_id, fetch the reconstructed content.
  const contentQuery = useQuery<FileContentResponse>({
    queryKey: ["files", "by-path", "content", matched?.id ?? ""],
    queryFn: () =>
      apiFetch<FileContentResponse>(
        `/api/files/${matched!.id}/content`,
        token,
      ),
    enabled: !!token && !!matched?.id,
    staleTime: 5 * 60_000,
  });

  return {
    file: matched,
    content: contentQuery.data,
    isLoading: listQuery.isLoading || contentQuery.isLoading,
    isError: listQuery.isError || contentQuery.isError,
    notFound: !!filepath && !listQuery.isLoading && syncIds.length > 0 && matched === null,
  };
}
