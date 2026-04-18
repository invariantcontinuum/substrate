import "@testing-library/jest-dom";

// jsdom omits EventSource; hooks that open SSE clients would otherwise
// throw "EventSource is not defined" the moment their useEffect runs.
// A no-op stub is sufficient for tests that aren't exercising SSE —
// close() is called on cleanup, and .on() is a no-op here.
class StubEventSource {
  url: string;
  readyState = 0;
  constructor(url: string) { this.url = url; }
  addEventListener() {}
  removeEventListener() {}
  close() {}
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
}

if (typeof globalThis.EventSource === "undefined") {
  (globalThis as unknown as { EventSource: unknown }).EventSource = StubEventSource;
}
