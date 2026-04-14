import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { useAuth } from "react-oidc-context";
import { LogOut, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type Tab = "account" | "settings";

export function UserModal() {
  const { activeModal, closeModal } = useUIStore();
  const auth = useAuth();
  const { theme, toggleTheme } = useThemeStore();
  const [tab, setTab] = useState<Tab>("account");

  const profile = auth.user?.profile;
  const username = (profile?.preferred_username as string) || "User";
  const email = (profile?.email as string) || "";
  const roles = ((profile?.realm_access as Record<string, string[]>)?.roles || []) as string[];
  const displayRole = roles.includes("admin")
    ? "admin"
    : roles.includes("engineer")
    ? "engineer"
    : "viewer";

  return (
    <Modal
      open={activeModal === "user"}
      onClose={closeModal}
      title="Account"
      maxWidth={400}
    >
      <div className="user-modal-tabs">
        <button
          type="button"
          className={`user-modal-tab${tab === "account" ? " is-active" : ""}`}
          onClick={() => setTab("account")}
        >
          Account
        </button>
        <button
          type="button"
          className={`user-modal-tab${tab === "settings" ? " is-active" : ""}`}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </div>

      {tab === "account" ? (
        <div className="user-modal">
          <div className="user-modal-avatar">{username.charAt(0).toUpperCase()}</div>
          <div className="user-modal-info">
            <div className="user-modal-name">{username}</div>
            {email && <div>{email}</div>}
            <Badge>{displayRole}</Badge>
          </div>
          <Button
            onClick={() => {
              closeModal();
              auth.signoutRedirect();
            }}
          >
            <LogOut size={14} />
            Sign Out
          </Button>
        </div>
      ) : (
        <div className="settings-modal">
          <div>
            <Label>Theme</Label>
            <div className="settings-modal-themes">
              {(["dark", "light"] as const).map((t) => {
                const active = theme === t;
                return (
                  <Button
                    key={t}
                    onClick={() => {
                      if (!active) toggleTheme();
                    }}
                  >
                    {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    {active && <span className="user-modal-tab-check"> ✓</span>}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
