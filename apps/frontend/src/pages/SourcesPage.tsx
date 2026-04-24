import { Outlet } from "react-router-dom";
import { TabStrip } from "@/components/common/TabStrip";
import { ActiveSetPill } from "@/components/sources/ActiveSetPill";
import { useGraphStore } from "@/stores/graph";

const TABS = [
  { to: "/sources", label: "Sources", end: true },
  { to: "/sources/snapshots", label: "Snapshots" },
  { to: "/sources/config", label: "Config" },
  { to: "/sources/activity", label: "Activity" },
];

export function SourcesPage() {
  const stats = useGraphStore((s) => s.stats);
  return (
    <div className="sources-page">
      <ActiveSetPill
        nodeCount={stats.nodeCount || undefined}
        edgeCount={stats.edgeCount || undefined}
      />
      <TabStrip items={TABS} />
      <div className="sources-tab-body">
        <Outlet />
      </div>
    </div>
  );
}
