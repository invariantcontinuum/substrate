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
      <div className="flex flex-col gap-7">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2.5 font-display">
            Theme
          </Label>
          <div className="flex gap-3">
            {(["dark", "light"] as const).map((t) => {
              const active = theme === t;
              return (
                <Button
                  key={t}
                  variant={active ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => { if (!active) toggleTheme(); }}
                >
                  {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
