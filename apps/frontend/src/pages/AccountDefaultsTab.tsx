import { SectionHeader } from "@/components/common/SectionHeader";
import { LeidenKnob } from "@/components/common/LeidenKnob";
import { Row } from "@/components/common/Row";
import { usePrefsStore, type LayoutPref, type ThemePref } from "@/stores/prefs";
import { usePreferences } from "@/hooks/usePreferences";
import { useCarouselStore } from "@/stores/carousel";

export function AccountDefaultsTab() {
  usePreferences();
  const prefs = usePrefsStore();
  const setStaged = useCarouselStore((s) => s.setStaged);

  return (
    <>
      <SectionHeader
        title="Default Leiden knobs"
        aux="applied when a device has no override"
      />
      <LeidenKnob
        label="Resolution"
        min={0.1}
        max={5}
        step={0.1}
        value={prefs.leiden.resolution}
        onChange={(v) => prefs.setLeiden({ resolution: v })}
      />
      <LeidenKnob
        label="Beta"
        min={0}
        max={0.1}
        step={0.005}
        value={prefs.leiden.beta}
        onChange={(v) => prefs.setLeiden({ beta: v })}
      />
      <LeidenKnob
        label="Iterations"
        min={1}
        max={50}
        step={1}
        value={prefs.leiden.iterations}
        onChange={(v) => prefs.setLeiden({ iterations: Math.round(v) })}
      />
      <LeidenKnob
        label="Min cluster size"
        min={1}
        max={100}
        step={1}
        value={prefs.leiden.min_cluster_size}
        onChange={(v) =>
          prefs.setLeiden({ min_cluster_size: Math.round(v) })
        }
      />
      <LeidenKnob
        label="Seed"
        min={0}
        max={9999}
        step={1}
        value={prefs.leiden.seed}
        onChange={(v) => prefs.setLeiden({ seed: Math.round(v) })}
      />
      <Row align="end">
        <button
          className="cta-ghost"
          onClick={() => setStaged({ ...prefs.leiden })}
        >
          Apply to current session
        </button>
      </Row>

      <SectionHeader title="Layout" />
      <Row
        k="Default layout"
        v={
          <select
            value={prefs.layout}
            onChange={(e) => prefs.setLayout(e.target.value as LayoutPref)}
          >
            <option value="force-directed">force-directed</option>
            <option value="hierarchical">hierarchical</option>
          </select>
        }
      />

      <SectionHeader title="Theme" />
      <Row
        k="Theme"
        v={
          <select
            value={prefs.theme}
            onChange={(e) => prefs.setTheme(e.target.value as ThemePref)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        }
      />

      <SectionHeader title="Telemetry" />
      <Row
        k="Send anonymous render times"
        v={
          <label>
            <input
              type="checkbox"
              checked={prefs.telemetry}
              onChange={(e) => prefs.setTelemetry(e.target.checked)}
            />{" "}
            {prefs.telemetry ? "on" : "off"}
          </label>
        }
      />
    </>
  );
}
