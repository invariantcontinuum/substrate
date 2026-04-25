import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { AccountProfileTab } from "@/pages/AccountProfileTab";
import { AccountDevicesTab } from "@/pages/AccountDevicesTab";
import { AccountDefaultsTab } from "@/pages/AccountDefaultsTab";
import { AccountIntegrationsTab } from "@/pages/AccountIntegrationsTab";
import { AccountBillingTab } from "@/pages/AccountBillingTab";

const TABS: { path: string; label: string; end?: boolean }[] = [
  { path: "/account", label: "Profile", end: true },
  { path: "/account/devices", label: "Devices" },
  { path: "/account/defaults", label: "Defaults" },
  { path: "/account/integrations", label: "Integrations" },
  { path: "/account/billing", label: "Billing" },
];

export function SettingsModal() {
  const isOpen = useUIStore((s) => s.activeModal === "settings");
  const closeModal = useUIStore((s) => s.closeModal);
  const navigate = useNavigate();
  const location = useLocation();

  const close = () => {
    closeModal();
    if (location.pathname.startsWith("/account")) {
      navigate("/chat");
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title="Settings"
      size="lg"
      contentClassName="settings-modal"
    >
      <div className="settings-modal-shell">
        <nav className="settings-modal-tabs" aria-label="Settings sections">
          {TABS.map((t) => (
            <NavLink
              key={t.path}
              to={t.path}
              end={t.end}
              className={({ isActive }) =>
                `settings-modal-tab${isActive ? " is-active" : ""}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="settings-modal-body">
          <Routes>
            <Route path="/account" element={<AccountProfileTab />} />
            <Route path="/account/devices" element={<AccountDevicesTab />} />
            <Route path="/account/defaults" element={<AccountDefaultsTab />} />
            <Route path="/account/integrations" element={<AccountIntegrationsTab />} />
            <Route path="/account/billing" element={<AccountBillingTab />} />
          </Routes>
        </div>
      </div>
    </Modal>
  );
}
