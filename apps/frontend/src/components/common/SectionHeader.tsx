import type { ReactNode } from "react";

interface Props {
  title: string;
  aux?: ReactNode;
}

export function SectionHeader({ title, aux }: Props) {
  return (
    <div className="section-header">
      <span className="section-header-title">{title}</span>
      {aux !== undefined && <span className="section-header-aux">{aux}</span>}
    </div>
  );
}
