interface Props {
  label: string;
  min: number; max: number; step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}

export function LeidenKnob({ label, min, max, step, value, onChange, hint }: Props) {
  return (
    <div className="leiden-knob" title={hint}>
      <span className="leiden-knob-label">{label}</span>
      <input
        type="range"
        role="slider"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="leiden-knob-value">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
    </div>
  );
}
