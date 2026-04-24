import { NavLink } from "react-router-dom";

interface TabItem {
  to: string;
  label: string;
  end?: boolean;
}

export function TabStrip({ items }: { items: TabItem[] }) {
  return (
    <nav className="tab-strip" role="tablist">
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end ?? t.to.split("/").length <= 2}
          className={({ isActive }) =>
            `tab-strip-tab ${isActive ? "active" : ""}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
