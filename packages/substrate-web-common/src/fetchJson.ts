import { SubstrateApiError, ErrorResponse } from "./errors";

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  headers.set("Accept", "application/json");

  const res = await fetch(input, { ...init, headers });
  if (res.ok) return (await res.json()) as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-json error body — fall through to UNKNOWN
  }
  const parsed = body ? ErrorResponse.safeParse(body) : { success: false as const };
  if (parsed.success) {
    throw new SubstrateApiError(
      parsed.data.error.code,
      res.status,
      parsed.data.error.message,
      parsed.data.error.details,
      parsed.data.request_id,
    );
  }
  throw new SubstrateApiError("UNKNOWN", res.status, res.statusText);
}
