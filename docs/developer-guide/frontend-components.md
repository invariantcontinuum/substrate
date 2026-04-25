# Frontend Components

Reference guide for React components in the Substrate frontend.

---

## Layout Components

### `DashboardLayout`

**File:** `components/layout/DashboardLayout.tsx`

The root authenticated shell. Mounts global data hooks (`useSyncs`) so sync polling never stops. Validates persisted sync IDs on mount and initializes the sync set if empty.

**Children:**
- `Sidebar` (the only piece of app chrome — desktop and mobile)
- `dashboard-scrim` (mobile-only overlay scrim shown when sidebar is open)
- `ModalRoot`
- `SwapToast`
- `Outlet` (renders current page)

---

### `Sidebar`

**File:** `components/layout/Sidebar.tsx`

Open-webui-style global sidebar. The only piece of app chrome — replaces the legacy `TopBar` + icon-rail Sidebar + bottom `MobileNav`. Sections:

- **Header** — Substrate logo + sync indicator + collapse button (desktop)
- **Actions** — `+ New chat` button + thread search input
- **Primary nav** — `Chat` / `Graph` / `Sources` links (highlighted on the matching route)
- **Threads** — date-bucketed scrolling list (Today / Yesterday / Last 7 days / Last 30 days / Older) sourced from `useChatThreads`
- **Footer** — account avatar that opens `SettingsModal`

On `<1024px` the sidebar is hidden by default and slides in as a 280px overlay when each page's `<PageHeader>` hamburger is tapped. Tap-scrim and Escape close it. Persists open/closed state in `useUIStore.sidebarOpen` (initialised to OS-matched on first load).

**Props:** None (reads from `useUIStore`, `useChatThreads`, `useChatStore`, `useAuth`).

---

### `PageHeader`

**File:** `components/layout/PageHeader.tsx`

Reusable thin header (44px) mounted by every top-level page (`ChatPage`, `GraphPage`, `SourcesPage`). Shows:

- A hamburger button on `<1024px` when the sidebar is closed (toggles `useUIStore.sidebarOpen`)
- The page title
- An optional `right` slot (used by Sources to host the tab strip + active-set pill)

The hamburger is the sole entry point for opening the sidebar on mobile.

---

## Graph Components

### `GraphCanvas`

**File:** `components/graph/GraphCanvas.tsx`

The core graph visualization component. Lazily imports Cytoscape and initializes the instance.

**Key behaviors:**
- Performance flags: `textureOnViewport`, `hideEdgesOnViewport`, `pixelRatio: 1`
- Groups nodes by `source_id` into compound parent nodes
- Filters by legend type filter
- Falls back from `cose` to `grid` layout when >200 nodes
- Keyboard shortcuts: Ctrl/Cmd+0 (fit), +/- (zoom), Escape (deselect), L (relayout)
- One-way viewport sync: writes zoom/pan to store, never reads back

**Dependencies:** `stores/graph.ts`, `lib/cytoscapeLoader.ts`

---

### `DynamicLegend`

**File:** `components/graph/DynamicLegend.tsx`

Interactive legend showing the top 12 node types by count. Clicking toggles visibility in the canvas.

---

### `SignalsOverlay`

**File:** `components/graph/SignalsOverlay.tsx`

Floating overlay showing the last 3 graph signal events (type, nodeId truncated, timestamp).

---

### `ViolationBadge`

**File:** `components/graph/ViolationBadge.tsx`

Floating badge showing the current violation count.

---

### `NodeDetailPanel`

**File:** `components/panels/NodeDetailPanel.tsx`

Slide-over panel when a node is selected.

**Features:**
- Fetches node detail from `/api/graph/nodes/:id`
- Fetches/caches LLM summary from `/api/graph/nodes/:id/summary`
- Shows file metadata (language, lines, size, imports)
- Snapshot picker with divergence badge
- Summary with regenerate button
- Navigable neighbors list with edge type glyphs
- Deep-link to Sources modal

---

## Modals

All modals are routed through `ModalRoot.tsx`, which mounts **only the active modal**.

### `ModalRoot`

**File:** `components/modals/ModalRoot.tsx`

Maps `activeModal` (`ModalName`) to the correct component. Renders nothing when no modal is open. Explicitly ignores `nodeDetail` because `GraphPage` mounts `NodeDetailPanel` directly.

```typescript
type ModalName =
  | 'sources'
  | 'enrichment'
  | 'search'
  | 'graph'
  | 'user'
  | 'policies'
  | 'adrs'
  | 'drift'
  | 'query'
  | 'nodeDetail'
  | null;
```

**Note:** `nodeDetail` is **not** rendered by `ModalRoot`; `GraphPage` handles it inline as a slide-over panel.

---

### `SourcesModal`

**File:** `components/modals/SourcesModal.tsx`

Two-pane layout for source and sync management.

**Structure:**
- Left: `SourcesSidebar` (list + add input)
- Right: `SourceDetailPane` (header, schedule, snapshots)

**State:**
- `selectedSourceId`
- `selectedSyncIds` (checkbox-based bulk selection)
- `expandedSyncId` (for issues inline)

---

### `SearchModal`

**File:** `components/modals/SearchModal.tsx`

Semantic search interface with query input, category filter, and domain filter. Calls `/api/graph/search`.

---

### `UserModal`

**File:** `components/modals/UserModal.tsx`

Tabbed modal:
- **Account**: Avatar, username, email, role badge, Sign Out
- **Settings**: Light/dark theme picker

---

### `GraphModal`

**File:** `components/modals/GraphModal.tsx`

Graph configuration modal. Currently exposes Leiden community-detection tuning.

---

### `EnrichmentModal`

**File:** `components/modals/EnrichmentModal.tsx`

Placeholder explaining that enrichment now runs inline during sync.

---

## Inline Notices

### `SyncAlreadyActiveNotice`

**File:** `components/SyncAlreadyActiveNotice.tsx`

Inline banner shown when a 409 `sync_already_active` response is returned. Includes an optional "View it" button to jump to the running sync.

---

## Sources Sub-Components

### `SourcesSidebar`

**File:** `components/modals/sources/SourcesSidebar.tsx`

Lists all sources with `loaded` and `running` status chips. Contains `AddSourceInput` and handles checkbox selection for bulk operations.

---

### `SourceListItem`

**File:** `components/modals/sources/SourceListItem.tsx`

Individual source row. Navigate-on-click, checkbox, status chips.

---

### `SourceDetailPane`

**File:** `components/modals/sources/SourceDetailPane.tsx`

Combines `DetailHeader`, `ScheduleStrip`, and `SnapshotList` for the active source.

---

### `SnapshotList`

**File:** `components/modals/sources/SnapshotList.tsx`

Infinite-scroll list of sync runs using `useSourceSyncs`. Supports auto-scroll to a deep-linked snapshot.

---

### `SnapshotRow`

**File:** `components/modals/sources/SnapshotRow.tsx`

Wrapper that renders `SnapshotRowSummary` and conditionally mounts `SnapshotIssuesInline` when expanded.

---

### `SnapshotRowSummary`

**File:** `components/modals/sources/SnapshotRowSummary.tsx`

Displays:
- Checkbox for bulk selection
- Relative timestamp
- Status chip (`pending`, `running`, `completed`, `failed`, `cancelled`, `cleaned`)
- Progress bar (numeric % during file phases, indeterminate spinner during embedding)
- Expand chevron

---

### `SnapshotIssuesInline`

**File:** `components/modals/sources/SnapshotIssuesInline.tsx`

Fetches and lists sync issues. Shows a Retry button. Caps rendering at 100 issues.

---

### `AddSourceInput`

**File:** `components/modals/sources/AddSourceInput.tsx`

Parses GitHub URLs (`owner/repo`), deduplicates against existing sources, and calls `createSource`.

---

### `UnifiedToolbar`

**File:** `components/modals/sources/UnifiedToolbar.tsx`

Context-aware bulk-action toolbar.

**Snapshot mode** (when syncs selected):
- Load, Unload, Clean, Purge

**Source mode** (when sources selected):
- Sync, Stop (if running), Set Schedule, Purge Sources

---

## UI Primitives

### `Modal`

**File:** `components/ui/Modal.tsx`

Base modal wrapper with backdrop, close button, and size variants.

### `dialog.tsx`

**File:** `components/ui/dialog.tsx`

Headless dialog primitives from `@base-ui/react`.

### `input.tsx`

**File:** `components/ui/input.tsx`

Styled text input component.

### `button.tsx`

**File:** `components/ui/button.tsx`

Styled button with variants (primary, secondary, ghost, danger).

### `badge.tsx`

**File:** `components/ui/badge.tsx`

Status/badge component.

### `select.tsx`

**File:** `components/ui/select.tsx`

Styled select dropdown from `@base-ui/react`.

---

## Component Patterns

### One-Way Data Flow

Graph canvas events write to Zustand, but Zustand does not write back to Cytoscape:

```typescript
// GraphCanvas.tsx
cy.on('zoom pan', () => {
  setZoom(cy.zoom());
  setPan(cy.pan());
});
// NEVER: cy.zoom(store.zoom) — would create a feedback loop
```

### Modal Isolation

Only the active modal renders. This prevents heavy hooks like `useSyncs` and `useSources` from running when unrelated modals are open.

```tsx
// ModalRoot.tsx
export function ModalRoot() {
  const { activeModal } = useUIStore();

  switch (activeModal) {
    case 'sources': return <SourcesModal />;
    case 'search': return <SearchModal />;
    // ...
    default: return null;
  }
}
```

### Sync Polling at Layout Level

`useSyncs()` is called inside `DashboardLayout`, not inside `SourcesModal`. This ensures sync-state detection works even when all modals are closed.

### Source Grouping on Canvas

Nodes with the same `source_id` are rendered as children of a Cytoscape compound parent:

```typescript
const parentId = `src:${source_id}`;
cy.add({
  group: 'nodes',
  data: { id: parentId },
  classes: 'compound'
});
```
