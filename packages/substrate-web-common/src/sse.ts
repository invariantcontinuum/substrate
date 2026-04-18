import { SseEvent, type SseEventT } from "./schemas/event";

type Handler = (ev: SseEventT) => void;

export interface SseClient {
  on(type: string, handler: Handler): void;
  close(): void;
  lastEventId(): string;
}

/**
 * Typed wrapper around EventSource. Known event types are pre-bound so
 * `client.on("sync_progress", handler)` works immediately. Control events
 * `token_expired` and `stream_dropped` are also surfaced — consumers typically
 * close the client and reopen with a fresh token when they fire.
 *
 * The browser's native EventSource reconnects automatically and populates
 * `Last-Event-ID` on reconnection, so the server's replay logic handles gaps.
 */
export function openSseClient(
  path: string,
  opts: {
    syncId?: string;
    sourceId?: string;
    baseUrl?: string;
    /**
     * JWT access token. Native EventSource can't set custom headers, so we
     * pass it as the OAuth2 `?access_token=` query param (RFC 6750 §2.3);
     * the gateway accepts it as an equivalent to `Authorization: Bearer`.
     */
    token?: string;
  } = {},
): SseClient {
  const qs = new URLSearchParams();
  if (opts.syncId) qs.set("sync_id", opts.syncId);
  if (opts.sourceId) qs.set("source_id", opts.sourceId);
  if (opts.token) qs.set("access_token", opts.token);
  const url = `${opts.baseUrl ?? ""}${path}?${qs.toString()}`;

  let lastId = "";
  const handlers: Record<string, Handler[]> = {};
  const es = new EventSource(url, { withCredentials: true });

  const dispatch = (type: string, ev: MessageEvent): void => {
    if (ev.lastEventId) lastId = ev.lastEventId;
    if (type === "token_expired" || type === "stream_dropped") {
      for (const h of handlers[type] ?? []) {
        h({
          id: "",
          type,
          payload: {},
          emitted_at: new Date().toISOString(),
        });
      }
      return;
    }
    try {
      const parsed = SseEvent.parse(JSON.parse(ev.data));
      for (const h of handlers[type] ?? []) h(parsed);
    } catch {
      // drop malformed
    }
  };

  const bind = (type: string): void => {
    es.addEventListener(type, ((e: Event) => dispatch(type, e as MessageEvent)) as EventListener);
  };

  const KNOWN = [
    "sync_lifecycle",
    "sync_progress",
    "source_changed",
    "snapshot_loaded",
    "token_expired",
    "stream_dropped",
  ];
  KNOWN.forEach(bind);

  return {
    on(type, handler) {
      (handlers[type] ||= []).push(handler);
      if (!KNOWN.includes(type)) bind(type);
    },
    close() {
      es.close();
    },
    lastEventId() {
      return lastId;
    },
  };
}
