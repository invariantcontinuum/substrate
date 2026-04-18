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

// All API calls are relative — frontend nginx proxies /api, /jobs, /ingest,
// /auth routes to the gateway. There is no public gateway domain, so the
// browser only ever talks to the frontend host.
const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch<T>(
  path: string,
  token: string | undefined,
  options?: RequestInit
): Promise<T> {
  const method = options?.method ?? "GET";
  const url = `${API_BASE}${path}`;
  logger.debug("api_request_start", { method, url });
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

  logger.debug("api_response_ok", { method, url, status: resp.status, durationMs });
  return resp.json();
}
