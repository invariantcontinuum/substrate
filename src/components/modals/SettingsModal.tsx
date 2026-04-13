import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function SettingsModal() {
  const { activeModal, closeModal } = useUIStore();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <Modal open={activeModal === "settings"} onClose={closeModal} title="Settings">
      <div>
        <Label>Theme</Label>
        <div>
          {(["dark", "light"] as const).map((t) => {
            const active = theme === t;
            return (
              <Button key={t} onClick={() => { if (!active) toggleTheme(); }}>
                {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
