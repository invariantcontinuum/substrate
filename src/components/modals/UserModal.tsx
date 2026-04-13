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
      <div className="flex flex-col items-center gap-6 py-6">
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{ background: "var(--accent-soft)", border: "2px solid var(--accent-medium)" }}
        >
          <span style={{ fontSize: 26, color: "var(--accent)", fontWeight: 800, fontFamily: "var(--font-display)" }}>
            {username.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="text-center">
          <div className="text-[15px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{username}</div>
          {email && <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>{email}</div>}
          <div
            className="inline-block mt-3 px-3 py-1.5 text-[10px] font-semibold"
            style={{
              background: "var(--accent-soft)", border: "1px solid var(--accent-medium)",
              borderRadius: "var(--radius-md)", color: "var(--accent)",
            }}
          >
            {displayRole}
          </div>
        </div>
        <button
          onClick={() => { closeModal(); auth.signoutRedirect(); }}
          className="glass-btn flex items-center gap-2 mt-2"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </Modal>
  );
}
