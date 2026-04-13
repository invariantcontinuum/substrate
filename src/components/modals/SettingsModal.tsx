import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { Sun, Moon } from "lucide-react";

export function SettingsModal() {
  const { activeModal, closeModal } = useUIStore();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <Modal open={activeModal === "settings"} onClose={closeModal} title="Settings">
      <div className="flex flex-col gap-7">
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-3 font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>
            Theme
          </div>
          <div className="flex gap-3">
            {(["dark", "light"] as const).map((t) => {
              const active = theme === t;
              return (
                <button
                  key={t}
                  onClick={() => { if (!active) toggleTheme(); }}
                  className="flex items-center gap-2.5 px-5 py-3 text-[12px] font-medium"
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: active ? "var(--neu-inset)" : "var(--neu-extruded-sm)",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    transition: "all 0.3s ease-out",
                  }}
                >
                  {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </Modal>
  );
}
