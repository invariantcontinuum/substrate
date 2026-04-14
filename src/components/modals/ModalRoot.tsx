import { useUIStore } from "@/stores/ui";
import { ComingSoonModal } from "./ComingSoonModal";
import { UserModal } from "./UserModal";
import { SourcesModal } from "./SourcesModal";
import { EnrichmentModal } from "./EnrichmentModal";
import { SearchModal } from "./SearchModal";

export function ModalRoot() {
  const { activeModal } = useUIStore();
  if (!activeModal) return null;

  return (
    <>
      <SourcesModal />
      <EnrichmentModal />
      <SearchModal />
      {/* Settings now live inside UserModal as a tab. */}
      <UserModal />
      <ComingSoonModal name="policies" />
      <ComingSoonModal name="adrs" />
      <ComingSoonModal name="drift" />
      <ComingSoonModal name="query" />
    </>
  );
}
