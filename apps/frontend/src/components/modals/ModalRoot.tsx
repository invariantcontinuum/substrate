import { useUIStore, type ModalName } from "@/stores/ui";
import { ComingSoonModal } from "./ComingSoonModal";
import { UserModal } from "./UserModal";
import { EnrichmentModal } from "./EnrichmentModal";
import { SettingsModal } from "./SettingsModal";

// Only mount the modal that matches the active name. Previously every
// modal component rendered as long as ANY modal was open, which meant
// opening "Account" also ran `useJobs` inside SourcesModal, fetched data
// in EnrichmentModal, and so on. Now each modal's hooks/network calls
// are scoped to the moment the user actually opens it.
//
// `nodeDetail` is handled inline by GraphPage (its own panel component),
// so it's not in this map.
// `sources` is now a full-page view toggled via useUIStore.activeView —
// removed from this modal map in Task 8; SourcesModal deleted in Task 9.
// `search` was a centred modal too; replaced with the header-anchored
// GraphSearchAnchor/Dropdown, so no entry here.
const MODAL_COMPONENTS: Partial<Record<NonNullable<ModalName>, React.ComponentType>> = {
  enrichment: EnrichmentModal,
  user: UserModal,
  settings: SettingsModal,
  // Coming-soon stubs share a single component keyed on the modal name
  // so we render exactly one at a time with the right copy.
  policies: () => <ComingSoonModal name="policies" />,
  adrs: () => <ComingSoonModal name="adrs" />,
  drift: () => <ComingSoonModal name="drift" />,
  query: () => <ComingSoonModal name="query" />,
};

export function ModalRoot() {
  const activeModal = useUIStore((s) => s.activeModal);
  if (!activeModal) return null;
  const Active = MODAL_COMPONENTS[activeModal];
  if (!Active) return null;
  return <Active />;
}
