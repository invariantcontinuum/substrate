import { Outlet } from "react-router-dom";
import { TabStrip } from "@/components/common/TabStrip";
import { ActiveSetPill } from "@/components/sources/ActiveSetPill";
import { PageHeader } from "@/components/layout/PageHeader";

const TABS = [
  { to: "/sources", label: "Sources", end: true },
  { to: "/sources/snapshots", label: "Snapshots" },
  { to: "/sources/config", label: "Config" },
  { to: "/sources/activity", label: "Activity" },
];

export function SourcesPage() {
  return (
    <div className="sources-page">
      <PageHeader title="Sources" right={<ActiveSetPill />} />
      <TabStrip items={TABS} />
      <div className="sources-tab-body">
        <Outlet />
      </div>
    </div>
  );
}
