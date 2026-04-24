import { useEffect } from "react";
import { usePrefsStore } from "@/stores/prefs";

/**
 * Mirrors ``prefs.theme`` onto ``<html class="theme-light|theme-dark">`` so
 * CSS tokens in ``globals.css`` can swap palettes without rerendering the
 * tree. ``system`` resolves to the OS preference via ``matchMedia``; the
 * effect re-runs whenever the pref changes.
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
      root.classList.remove("theme-light", "theme-dark");
      root.classList.add(`theme-${resolve()}`);
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
