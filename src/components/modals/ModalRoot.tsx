import { useUIStore, type ModalName } from "@/stores/ui";
import { ComingSoonModal } from "./ComingSoonModal";
import { UserModal } from "./UserModal";
import { SourcesModal } from "./SourcesModal";
import { EnrichmentModal } from "./EnrichmentModal";
import { SearchModal } from "./SearchModal";
import { GraphModal } from "./GraphModal";

// Only mount the modal that matches the active name. Previously every
// modal component rendered as long as ANY modal was open, which meant
// opening "Account" also ran `useJobs` inside SourcesModal, fetched data
// in EnrichmentModal, and so on. Now each modal's hooks/network calls
// are scoped to the moment the user actually opens it.
//
// `nodeDetail` is handled inline by GraphPage (its own panel component),
// so it's not in this map.
const MODAL_COMPONENTS: Partial<Record<NonNullable<ModalName>, React.ComponentType>> = {
  graph: GraphModal,
  sources: SourcesModal,
  enrichment: EnrichmentModal,
  search: SearchModal,
  user: UserModal,
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
