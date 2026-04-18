// Trigger a client-side JSON download. Wraps the usual
// Blob → createObjectURL → anchor.click() → revokeObjectURL dance so
// call sites don't repeat it. Used by the node-detail and
// currently-rendered-rail export buttons.
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
