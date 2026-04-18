import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadJson } from "./download";

describe("downloadJson", () => {
  let clickedAnchor: HTMLAnchorElement | null = null;
  let revoked: string | null = null;
  let urlIdx = 0;
  const originalCreateElement = document.createElement;

  beforeEach(() => {
    clickedAnchor = null;
    revoked = null;
    urlIdx = 0;

    URL.createObjectURL = vi.fn(() => `blob:fake-${++urlIdx}`);
    URL.revokeObjectURL = vi.fn((u: string) => { revoked = u; });

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement.call(document, tag) as HTMLAnchorElement;
      if (tag === "a") {
        el.click = () => { clickedAnchor = el; };
      }
      return el;
    });
  });

  it("creates a Blob URL and clicks an anchor with the given filename", () => {
    downloadJson("foo.json", { hello: "world" });
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.download).toBe("foo.json");
    expect(clickedAnchor!.href).toMatch(/^blob:fake-/);
  });

  it("revokes the blob URL after click", () => {
    downloadJson("bar.json", { a: 1 });
    expect(revoked).toMatch(/^blob:fake-/);
  });

  it("serializes payload as pretty-printed JSON", () => {
    const mkBlob = vi.fn();
    const originalBlob = globalThis.Blob;
    globalThis.Blob = class {
      constructor(parts: BlobPart[], opts: BlobPropertyBag) {
        mkBlob(parts, opts);
      }
    } as unknown as typeof Blob;

    downloadJson("baz.json", { k: "v" });

    expect(mkBlob).toHaveBeenCalledTimes(1);
    const [parts, opts] = mkBlob.mock.calls[0];
    expect(opts.type).toBe("application/json");
    expect(parts[0]).toBe(JSON.stringify({ k: "v" }, null, 2));

    globalThis.Blob = originalBlob;
  });
});
