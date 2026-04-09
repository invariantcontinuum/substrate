import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useAuth } from "react-oidc-context";
import { LogOut } from "lucide-react";

export function UserModal() {
  const { activeModal, closeModal } = useUIStore();
  const auth = useAuth();
  const profile = auth.user?.profile;
  const username = (profile?.preferred_username as string) || "User";
  const email = (profile?.email as string) || "";
  const roles = ((profile?.realm_access as Record<string, string[]>)?.roles || []) as string[];
  const displayRole = roles.includes("admin") ? "admin" : roles.includes("engineer") ? "engineer" : "viewer";

  return (
    <Modal open={activeModal === "user"} onClose={closeModal} title="Account" maxWidth={360}>
      <div className="flex flex-col items-center gap-4 py-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.2)", border: "2px solid rgba(99,102,241,0.3)" }}
        >
          <span style={{ fontSize: 24, color: "#a5b4fc", fontWeight: 700 }}>
            {username.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="text-center">
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{username}</div>
          {email && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{email}</div>}
          <div
            className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}
          >
            {displayRole}
          </div>
        </div>
        <button
          onClick={() => { closeModal(); auth.signoutRedirect(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium mt-2 transition-colors"
          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </Modal>
  );
}
