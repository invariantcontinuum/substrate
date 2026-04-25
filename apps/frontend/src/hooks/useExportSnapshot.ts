import { useExportEndpoint } from "./useExportEndpoint";

export function useExportSnapshot() {
  const ex = useExportEndpoint();
  return (syncId: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return ex(
      `/api/export/sync/${syncId}`,
      `substrate-sync-${syncId.slice(0, 8)}-${stamp}.json`,
    );
  };
}
