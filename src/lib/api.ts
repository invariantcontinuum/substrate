import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const API_BASE = import.meta.env.VITE_API_URL || (
  window.location.hostname === "localhost"
    ? ""
    : `${window.location.protocol}//substrate.${window.location.hostname.split(".").slice(-2).join(".")}`
);

export async function apiFetch<T>(
  path: string,
  token: string | undefined,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}
