# Substrate Frontend Theme Guide

Design token reference for the substrate-platform frontend. All tokens live in `src/styles/globals.css` as CSS custom properties and automatically switch between dark (default) and light (`.light` class on `<html>`).

## Theme Toggle

The theme is persisted in `zustand` (`stores/theme.ts`) and applied as a class on `<html>`:
- Dark (default): no extra class, `:root` tokens apply
- Light: `.light` class, overrides apply

Toggle from Settings modal or via `useThemeStore().toggle()`.

## Design Tokens

### Surfaces
| Token | Dark | Light | Usage |
|---|---|---|---|
| `--bg` | `#060608` | `#f8f8fa` | Page background |
| `--bg-surface` | `#0c0c11` | `#ffffff` | Sidebar, topbar, cards |
| `--bg-elevated` | `#121218` | `#f0f0f4` | Modals, dropdowns |
| `--bg-hover` | `rgba(255,255,255,0.03)` | `rgba(0,0,0,0.03)` | Interactive hover state |
| `--bg-active` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` | Pressed/active state |

### Borders
| Token | Dark | Light |
|---|---|---|
| `--border` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.08)` |
| `--border-subtle` | `rgba(255,255,255,0.03)` | `rgba(0,0,0,0.04)` |
| `--border-active` | `rgba(99,102,241,0.2)` | `rgba(99,102,241,0.25)` |

### Typography
| Token | Dark | Light | Usage |
|---|---|---|---|
| `--text-primary` | `#eeeef2` | `#111118` | Headings, primary content |
| `--text-secondary` | `#85859e` | `#64647a` | Labels, descriptions |
| `--text-muted` | `#4a4a5e` | `#9e9eb2` | Placeholders, disabled |
| `--text-inverse` | `#0c0c11` | `#eeeef2` | Text on accent backgrounds |

### Accent (Indigo)
| Token | Dark | Light |
|---|---|---|
| `--accent` | `#6366f1` | `#6366f1` |
| `--accent-soft` | `rgba(99,102,241,0.1)` | `rgba(99,102,241,0.08)` |
| `--accent-medium` | `rgba(99,102,241,0.18)` | `rgba(99,102,241,0.14)` |
| `--accent-text` | `#a5b4fc` | `#4f46e5` |

### Semantic Colors
| Token | Dark | Light | Usage |
|---|---|---|---|
| `--success` / `--success-text` | `#10b981` / `#6ee7b7` | — / `#059669` | Connected, healthy |
| `--error` / `--error-text` | `#ef4444` / `#fca5a5` | — / `#dc2626` | Violations, failures |
| `--warning` / `--warning-text` | `#f59e0b` / `#fcd34d` | — / `#d97706` | Drift, reconnecting |

### Layout
| Token | Value |
|---|---|
| `--sidebar-width` | `52px` |
| `--topbar-height` | `42px` |
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `10px` |
| `--radius-xl` | `14px` |

### Font Stacks
| Token | Value |
|---|---|
| `--font-sans` | `"Geist Variable", -apple-system, ...` |
| `--font-mono` | `"JetBrains Mono", "SF Mono", ...` |

## Graph Theme

The WASM graph engine has its own theme object passed via the `theme` prop on `<Graph>`. It lives in `src/lib/graph-theme.ts` and is independent of CSS variables (the engine runs in WebGL, not DOM). See that file for the night-neon palette and node type color assignments.

## Utility Classes

Defined in `globals.css`:
- `.glass-panel` — frosted glass overlay
- `.violation-pulse` — red pulsing glow
- `.signal-enter` — slide-in from left (240ms)
- `.grid-bg` — subtle dot grid background

## Dependencies

After cleanup (v2026-04-12), the frontend uses:
- **Tailwind CSS** — utility-first classes via `@tailwindcss/vite`
- **Geist Variable** — sans-serif font via `@fontsource-variable/geist`
- **Lucide React** — icons

Removed: shadcn, class-variance-authority, clsx, tailwind-merge, tw-animate-css, @base-ui/react (294 packages eliminated).
