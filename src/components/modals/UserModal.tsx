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
      <div className="flex flex-col items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10">
          <span className="text-2xl font-extrabold text-primary">
            {username.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-foreground">{username}</div>
          {email && <div className="mt-1 text-xs text-muted-foreground">{email}</div>}
          <Badge variant="secondary" className="mt-2">
            {displayRole}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { closeModal(); auth.signoutRedirect(); }}
        >
          <LogOut size={14} />
          Sign Out
        </Button>
      </div>
    </Modal>
  );
}
