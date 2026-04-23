import { AskThreadRail } from "@/components/ask/AskThreadRail";
import { AskChatPane } from "@/components/ask/AskChatPane";

export function AskPage() {
  return (
    <div className="ask-page">
      <AskThreadRail />
      <AskChatPane />
    </div>
  );
}
