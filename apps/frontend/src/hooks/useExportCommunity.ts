import { useExportEndpoint } from "./useExportEndpoint";

export function useExportCommunity() {
  const ex = useExportEndpoint();
  return (cacheKey: string, communityIndex: number) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return ex(
      `/api/export/community/${encodeURIComponent(cacheKey)}/${communityIndex}`,
      `substrate-community-${communityIndex}-${stamp}.json`,
    );
  };
}
