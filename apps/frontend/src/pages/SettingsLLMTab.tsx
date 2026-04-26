/**
 * Settings → LLM Connections.
 *
 * Renders a sub-tab strip across the four roles (dense / sparse /
 * embedding / reranker) with one role's panel visible at a time. The
 * active role is mirrored in the URL via `?role=` so deep-linking and
 * browser back/forward navigate sub-tabs correctly.
 */
import { useSearchParams } from "react-router-dom";
import {
  LLMConnectionPanel,
  type LLMConnectionRole,
} from "@/components/modals/tabs/LLMConnectionPanel";

interface RoleTab {
  role: LLMConnectionRole;
  label: string;
}

const ROLES: RoleTab[] = [
  { role: "dense", label: "Dense" },
  { role: "sparse", label: "Sparse" },
  { role: "embedding", label: "Embedding" },
  { role: "reranker", label: "Reranker" },
];

const isRole = (value: string | null): value is LLMConnectionRole =>
  value === "dense" ||
  value === "sparse" ||
  value === "embedding" ||
  value === "reranker";

export function SettingsLLMTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get("role");
  const active: LLMConnectionRole = isRole(param) ? param : "dense";

  function selectRole(next: LLMConnectionRole): void {
    if (next === active) return;
    const params = new URLSearchParams(searchParams);
    params.set("role", next);
    // `replace: true` keeps the modal sub-navigation out of the
    // browser history stack so back/forward leaves the modal cleanly.
    setSearchParams(params, { replace: true });
  }

  return (
    <section className="settings-llm">
      <h3>LLM Connections</h3>
      <div
        className="llm-role-tabs"
        role="tablist"
        aria-label="LLM role"
      >
        {ROLES.map((t) => {
          const isActive = t.role === active;
          return (
            <button
              key={t.role}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`llm-role-tabs__tab${isActive ? " is-active" : ""}`}
              onClick={() => selectRole(t.role)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <LLMConnectionPanel key={active} role={active} />
    </section>
  );
}
