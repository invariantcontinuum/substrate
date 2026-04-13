import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useAuth } from "react-oidc-context";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10"
        >
          <span className="text-[26px] font-extrabold text-primary font-display">
            {username.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="text-center">
          <div className="text-[15px] font-bold text-foreground font-display">{username}</div>
          {email && <div className="mt-1.5 text-[11px] text-muted-foreground">{email}</div>}
          <Badge variant="secondary" className="mt-3">
            {displayRole}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { closeModal(); auth.signoutRedirect(); }}
          className="mt-2"
        >
          <LogOut size={14} />
          Sign Out
        </Button>
      </div>
    </Modal>
  );
}
