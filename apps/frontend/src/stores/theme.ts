import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Apply the theme by setting `data-theme` on <html>. theme.css scopes
 * its variable blocks to this attribute so every element using the
 * tokens transitions smoothly on change (we declared `transition` on
 * :root and all themed surfaces in theme.css).
 *
 * Also kept the legacy `.dark` / `.light` classes so any third-party
 * integration that hooks into those (pgn, mkdocs, etc.) keeps working.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === "dark" ? "light" : "dark";
          applyTheme(next);
          return { theme: next };
        }),
    }),
    {
      name: "substrate-theme",
      // Re-apply on hydration so a reload doesn't flash the wrong theme.
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);

// Apply the default immediately so the first paint matches the token
// set, even before the Zustand hydrator runs.
if (typeof document !== "undefined") {
  const existing = document.documentElement.getAttribute("data-theme");
  if (existing !== "dark" && existing !== "light") {
    applyTheme("light");
  }
}
