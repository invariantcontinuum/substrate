import { useUsage } from "@/hooks/useUsage";

const bytesFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function AccountBillingTab() {
  const usage = useUsage();
  return (
    <div className="billing-placeholder">
      <p>
        You're on <b>Local / Dev</b>.
      </p>
      {usage ? (
        <p className="muted">
          {usage.sources} sources · {usage.snapshots} snapshots ·{" "}
          {bytesFmt.format(usage.embedding_bytes)} B embeddings ·{" "}
          {bytesFmt.format(usage.graph_bytes)} B graph
        </p>
      ) : (
        <p className="muted">Loading usage…</p>
      )}
      <p className="muted">
        Plan selector, invoices, and payment methods will appear here.
      </p>
    </div>
  );
}
