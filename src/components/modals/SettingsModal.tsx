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
          <div className="section-label" style={{ fontFamily: "var(--font-display)" }}>
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
                    background: active ? "var(--accent-soft)" : "var(--bg-hover)",
                    border: active ? "1px solid var(--accent-medium)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    transition: "all 0.15s ease",
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
