import { useEffect } from "react";
import { usePrefsStore } from "@/stores/prefs";

/**
 * Mirrors ``prefs.theme`` onto ``<html data-theme="light|dark">`` so the
 * `[data-theme]`-keyed token blocks in ``theme.css`` swap palettes
 * without rerendering the tree. ``system`` resolves to the OS preference
 * via ``matchMedia``; the effect re-runs whenever the pref changes.
 *
 * Also keeps the legacy `.light`/`.dark` classes + `color-scheme` style
 * in sync so any third-party integration hooking into those (mkdocs,
 * etc.) keeps working — same behavior as `useThemeStore.applyTheme`.
 */
export function useApplyTheme(): void {
  const theme = usePrefsStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const resolve = (): "light" | "dark" => {
      if (theme === "light" || theme === "dark") return theme;
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    };
    const apply = () => {
      const resolved = resolve();
      root.setAttribute("data-theme", resolved);
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      root.style.colorScheme = resolved;
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
