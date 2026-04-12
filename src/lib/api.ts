import { QueryClient } from "@tanstack/react-query";
import { logger } from "@/lib/logger";

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
  const method = options?.method ?? "GET";
  const url = `${API_BASE}${path}`;
  logger.info("api_request_start", { method, url });
  const start = performance.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let resp: Response;
  try {
    resp = await fetch(url, { ...options, headers });
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logger.error("api_request_failed", { method, url, durationMs, error: String(err) });
    throw err;
  }

  const durationMs = Math.round(performance.now() - start);

  if (!resp.ok) {
    logger.error("api_response_error", { method, url, status: resp.status, statusText: resp.statusText, durationMs });
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }

  logger.info("api_response_ok", { method, url, status: resp.status, durationMs });
  return resp.json();
}
