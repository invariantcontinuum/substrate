interface Props {
  selection: Set<string>;
  onLoadSelection: () => void;
  onClear: () => void;
}

export function MassActionBar({ selection, onLoadSelection, onClear }: Props) {
  if (selection.size === 0) return null;
  return (
    <div className="mass-action-bar">
      <span>{selection.size} selected</span>
      <span style={{ flex: 1 }} />
      <button onClick={onLoadSelection} className="mab-primary">Load selection</button>
      <button onClick={onClear} className="mab-ghost">Clear</button>
    </div>
  );
}
