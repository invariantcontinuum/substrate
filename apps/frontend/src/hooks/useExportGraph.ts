import { useAuth } from "react-oidc-context";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useExportGraph() {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  return async (syncIds: string[]) => {
    if (syncIds.length === 0) return;
    const url =
      `${API_BASE}/api/export/loaded?sync_ids=` +
      encodeURIComponent(syncIds.join(","));
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`export failed: ${resp.status}`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `substrate-graph-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };
}
