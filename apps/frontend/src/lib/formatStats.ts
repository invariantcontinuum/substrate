export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

// Derive a remaining-time estimate for a running sync from its progress
// counters. Returns null when we can't make a defensible estimate —
// which is the right answer for the UI (em-dash) rather than a fake
// "calculating…" that never resolves.
//
// Rules:
//   - Need a monotonic `startedAt`, a `done` > 0, and `total > done`.
//   - Rate = done / elapsedMs. ETA = (total − done) / rate.
//   - Guard against rate = 0 (done stayed flat while time ticked forward)
//     and total ≤ done (finishing/finished).
export function estimateEtaMs(
  startedAt: string | null,
  done: number | null | undefined,
  total: number | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!startedAt || done == null || total == null) return null;
  if (done <= 0 || total <= done) return null;
  const elapsed = now - new Date(startedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return null;
  const rate = done / elapsed;
  if (rate <= 0) return null;
  const remaining = (total - done) / rate;
  if (!Number.isFinite(remaining) || remaining < 0) return null;
  return remaining;
}
