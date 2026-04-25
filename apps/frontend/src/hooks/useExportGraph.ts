import { useExportEndpoint } from "./useExportEndpoint";

export function useExportGraph() {
  const ex = useExportEndpoint();
  return async (syncIds: string[]) => {
    if (syncIds.length === 0) return;
    const path =
      `/api/export/loaded?sync_ids=` +
      encodeURIComponent(syncIds.join(","));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return ex(path, `substrate-graph-${stamp}.json`);
  };
}
