import { useEffect } from "react";
import { useUIStore } from "@/stores/ui";

/**
 * `/account/*` deep links auto-open the SettingsModal at the matching tab.
 * The modal owns its own internal Routes; AccountPage renders nothing
 * itself — it just opens the modal on mount.
 */
export function AccountPage() {
  const openModal = useUIStore((s) => s.openModal);
  useEffect(() => {
    openModal("settings");
  }, [openModal]);
  return null;
}
