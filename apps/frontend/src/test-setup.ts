import "@testing-library/jest-dom";

// jsdom does not implement window.matchMedia; provide a stub so stores and
// hooks that call it at initialisation time (e.g. useResponsive, ui.ts) do
// not throw in unit/integration tests.
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

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
