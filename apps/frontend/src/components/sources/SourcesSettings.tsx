// frontend/src/components/sources/SourcesSettings.tsx
import { useEffect, useReducer } from "react";
import { ArrowLeft } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { SourcesSidebar } from "./SourcesSidebar";
import { SourceDetailPane } from "./SourceDetailPane";
import { UnifiedToolbar } from "./UnifiedToolbar";
import { CurrentlyRenderedRail } from "./CurrentlyRenderedRail";

interface State {
  activeSourceId: string | null;
  selectedSourceIds: Set<string>;
  selectedSyncIds: Set<string>;
  initialExpandSyncId: string | null;
  scheduleExpanded: boolean;
}

type Action =
  | { type: "NAVIGATE"; sourceId: string }
  | { type: "BACK" }
  | { type: "TOGGLE_SELECT_SOURCE"; id: string }
  | { type: "TOGGLE_SELECT_SYNC"; id: string }
  | { type: "CLEAR_SNAPSHOT_SELECTION" }
  | { type: "CLEAR_SOURCE_SELECTION" }
  | { type: "TOGGLE_SCHEDULE" }
  | { type: "DEEP_LINK"; sourceId: string; expandSyncId: string | null }
  | { type: "ALREADY_ACTIVE"; sourceId: string; syncId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "NAVIGATE":
      return {
        ...state,
        activeSourceId: action.sourceId,
        selectedSourceIds: new Set(),
        selectedSyncIds: new Set(),
        scheduleExpanded: false,
        initialExpandSyncId: null,
      };
    case "BACK":
      return {
        ...state,
        activeSourceId: null,
        selectedSyncIds: new Set(),
        initialExpandSyncId: null,
      };
    case "TOGGLE_SELECT_SOURCE": {
      const next = new Set(state.selectedSourceIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      // Source and snapshot selection are mutually exclusive: the unified
      // toolbar only has one action surface, so selecting a source must
      // clear any active snapshot selection (and vice versa).
      return {
        ...state,
        selectedSourceIds: next,
        selectedSyncIds: next.size > 0 ? new Set() : state.selectedSyncIds,
      };
    }
    case "TOGGLE_SELECT_SYNC": {
      const next = new Set(state.selectedSyncIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return {
        ...state,
        selectedSyncIds: next,
        selectedSourceIds: next.size > 0 ? new Set() : state.selectedSourceIds,
      };
    }
    case "CLEAR_SNAPSHOT_SELECTION":
      return { ...state, selectedSyncIds: new Set() };
    case "CLEAR_SOURCE_SELECTION":
      return { ...state, selectedSourceIds: new Set() };
    case "TOGGLE_SCHEDULE":
      return { ...state, scheduleExpanded: !state.scheduleExpanded };
    case "DEEP_LINK":
      return {
        ...state,
        activeSourceId: action.sourceId,
        initialExpandSyncId: action.expandSyncId,
        selectedSourceIds: new Set(),
        selectedSyncIds: new Set(),
      };
    case "ALREADY_ACTIVE":
      return {
        ...state,
        activeSourceId: action.sourceId,
        initialExpandSyncId: action.syncId,
      };
    default:
      return state;
  }
}

const initial: State = {
  activeSourceId: null,
  selectedSourceIds: new Set(),
  selectedSyncIds: new Set(),
  initialExpandSyncId: null,
  scheduleExpanded: false,
};

export function SourcesSettings() {
  const [state, dispatch] = useReducer(reducer, initial);

  const sourcesPageTarget = useUIStore((s) => s.sourcesPageTarget);
  const setSourcesPageTarget = useUIStore((s) => s.setSourcesPageTarget);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Consume the deep-link target whenever it arrives while on the sources view.
  // useReducer dispatch is safe inside useEffect — it batches all state changes
  // into a single update, avoiding any cascading-render concern.
  useEffect(() => {
    if (!sourcesPageTarget || activeView !== "sources") return;
    dispatch({
      type: "DEEP_LINK",
      sourceId: sourcesPageTarget.sourceId,
      expandSyncId: sourcesPageTarget.expandSyncId,
    });
    setSourcesPageTarget(null);
  }, [sourcesPageTarget, activeView, setSourcesPageTarget]);

  return (
    <div className="sources-settings">
      <div className="sources-settings-header">
        <Button
          onClick={() => setActiveView("graph")}
          className="sources-settings-back"
          title="Back to graph"
        >
          <ArrowLeft size={14} /> Back to graph
        </Button>
      </div>
      <UnifiedToolbar
        selectedSourceIds={state.selectedSourceIds}
        selectedSyncIds={state.selectedSyncIds}
        scheduleExpanded={state.scheduleExpanded}
        onToggleSchedule={() => dispatch({ type: "TOGGLE_SCHEDULE" })}
        onSnapshotActionComplete={() => dispatch({ type: "CLEAR_SNAPSHOT_SELECTION" })}
        onSourceActionComplete={() => dispatch({ type: "CLEAR_SOURCE_SELECTION" })}
        onAlreadyActive={(syncId, sourceId) =>
          dispatch({ type: "ALREADY_ACTIVE", sourceId, syncId })
        }
      />
      <div className="sources-settings-body">
        <SourcesSidebar
          activeSourceId={state.activeSourceId}
          selectedSourceIds={state.selectedSourceIds}
          onNavigate={(id) => dispatch({ type: "NAVIGATE", sourceId: id })}
          onToggleSelect={(id) => dispatch({ type: "TOGGLE_SELECT_SOURCE", id })}
        />
        <div className="sources-settings-detail">
          {state.activeSourceId ? (
            <SourceDetailPane
              key={state.activeSourceId}
              sourceId={state.activeSourceId}
              onBack={() => dispatch({ type: "BACK" })}
              autoExpandSyncId={state.initialExpandSyncId}
              selectedSyncIds={state.selectedSyncIds}
              toggleSelectSync={(id) => dispatch({ type: "TOGGLE_SELECT_SYNC", id })}
            />
          ) : (
            <div className="sources-settings-empty muted">
              Select a source from the sidebar to inspect its snapshots.
            </div>
          )}
        </div>
        <CurrentlyRenderedRail />
      </div>
    </div>
  );
}
