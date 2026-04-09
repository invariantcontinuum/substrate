import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { useGraphStore } from "@/stores/graph";
import { Sun, Moon } from "lucide-react";

export function SettingsModal() {
  const { activeModal, closeModal } = useUIStore();
  const { theme, toggleTheme } = useThemeStore();
  const { layout, setLayout } = useGraphStore();

  return (
    <Modal open={activeModal === "settings"} onClose={closeModal} title="Settings">
      <div className="flex flex-col gap-5">
        {/* Theme */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
            Theme
          </div>
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { if (theme !== t) toggleTheme(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-all"
                style={{
                  background: theme === t ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${theme === t ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)"}`,
                  color: theme === t ? "#a5b4fc" : "var(--text-muted)",
                }}
              >
                {t === "dark" ? <Moon size={14} /> : <Sun size={14} />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Layout */}
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
            Graph Layout
          </div>
          <div className="flex gap-2">
            {([["force", "Force"], ["hierarchical", "Hierarchy"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setLayout(val as "force" | "hierarchical")}
                className="px-3 py-2 rounded-lg text-[11px] transition-all"
                style={{
                  background: layout === val ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${layout === val ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)"}`,
                  color: layout === val ? "#a5b4fc" : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
