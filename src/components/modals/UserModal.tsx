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
      <div>
        <div>
          <span>{username.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <div>{username}</div>
          {email && <div>{email}</div>}
          <Badge>{displayRole}</Badge>
        </div>
        <Button onClick={() => { closeModal(); auth.signoutRedirect(); }}>
          <LogOut size={14} />
          Sign Out
        </Button>
      </div>
    </Modal>
  );
}
