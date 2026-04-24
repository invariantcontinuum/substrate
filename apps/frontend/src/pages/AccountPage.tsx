import { Outlet } from "react-router-dom";
import { TabStrip } from "@/components/common/TabStrip";

const TABS = [
  { to: "/account", label: "Profile", end: true },
  { to: "/account/devices", label: "Devices" },
  { to: "/account/defaults", label: "Defaults" },
  { to: "/account/integrations", label: "Integrations" },
  { to: "/account/billing", label: "Billing" },
];

export function AccountPage() {
  return (
    <div className="account-page">
      <TabStrip items={TABS} />
      <div className="account-tab-body">
        <Outlet />
      </div>
    </div>
  );
}
