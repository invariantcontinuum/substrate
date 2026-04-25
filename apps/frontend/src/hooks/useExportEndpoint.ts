import { useAuth } from "react-oidc-context";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useExportEndpoint() {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  return async (path: string, filename: string) => {
    const resp = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`export failed: ${resp.status}`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };
}
