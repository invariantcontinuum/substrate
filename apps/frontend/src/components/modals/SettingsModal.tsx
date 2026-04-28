import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { AccountProfileTab } from "@/pages/AccountProfileTab";
import { AccountBillingTab } from "@/pages/AccountBillingTab";
import { SettingsGraphTab } from "@/pages/SettingsGraphTab";
import { SettingsLLMTab } from "@/pages/SettingsLLMTab";
import { SettingsPostgresTab } from "@/pages/SettingsPostgresTab";
import { SettingsAuthenticationTab } from "@/pages/SettingsAuthenticationTab";
import { SettingsGitHubTab } from "@/pages/SettingsGitHubTab";

const TABS: { path: string; label: string; end?: boolean }[] = [
  { path: "/account", label: "Profile", end: true },
  { path: "/account/graph", label: "Graph" },
  { path: "/account/llm", label: "LLM Connections" },
  { path: "/account/postgres", label: "Postgres" },
  { path: "/account/authentication", label: "Authentication" },
  { path: "/account/github", label: "GitHub" },
  { path: "/account/billing", label: "Billing" },
];

export function SettingsModal() {
  const isOpen = useUIStore((s) => s.activeModal === "settings");
  const closeModal = useUIStore((s) => s.closeModal);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

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
      bodyFlush
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
          <button
            type="button"
            className="settings-modal-tab settings-modal__signout btn-ghost"
            onClick={() => auth.signoutRedirect()}
          >
            Sign out
          </button>
        </nav>
        <div className="settings-modal-body">
          <div className="settings-modal__content">
            <Routes>
              <Route path="/account" element={<AccountProfileTab />} />
              <Route path="/account/graph" element={<SettingsGraphTab />} />
              <Route path="/account/llm" element={<SettingsLLMTab />} />
              <Route path="/account/postgres" element={<SettingsPostgresTab />} />
              <Route path="/account/authentication" element={<SettingsAuthenticationTab />} />
              <Route path="/account/github" element={<SettingsGitHubTab />} />
              <Route path="/account/billing" element={<AccountBillingTab />} />
            </Routes>
          </div>
        </div>
      </div>
    </Modal>
  );
}
