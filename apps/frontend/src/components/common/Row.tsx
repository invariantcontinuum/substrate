import type { ReactNode } from "react";

interface Props {
  k?: ReactNode;
  v?: ReactNode;
  children?: ReactNode;
  align?: "start" | "end";
  danger?: boolean;
}

export function Row({ k, v, children, align, danger }: Props) {
  return (
    <div
      className={`ui-row ${danger ? "is-danger" : ""} ${align === "end" ? "is-end" : ""}`}
    >
      {k !== undefined && <span className="ui-row-k">{k}</span>}
      <span className="ui-row-grow" />
      {v !== undefined && <span className="ui-row-v">{v}</span>}
      {children}
    </div>
  );
}
