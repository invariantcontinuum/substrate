import { useEffect, useState } from "react";
import {
  useChatSettings,
  usePatchChatSettings,
  useDeleteAllThreads,
  useArchiveAllThreads,
} from "@/hooks/useChatSettings";
import { useAuthToken } from "@/hooks/useAuthToken";

export function SettingsChatTab() {
  const settings   = useChatSettings();
  const patch      = usePatchChatSettings();
  const deleteAll  = useDeleteAllThreads();
  const archiveAll = useArchiveAllThreads();
  const token      = useAuthToken();

  const [turns, setTurns] = useState<number>(12);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (settings.data) setTurns(settings.data.history_turns);
  }, [settings.data]);

  const handleExport = async () => {
    const response = await fetch("/api/chat/threads/export", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "chats-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-chat">
      <section>
        <h3>History window</h3>
        <p>Number of prior user/assistant turn pairs to send to the model.</p>
        <input
          type="number"
          min={0}
          max={50}
          value={turns}
          onChange={e => setTurns(Number(e.target.value))}
        />
        <button onClick={() => patch.mutate({ history_turns: turns })}>Save</button>
      </section>

      <section>
        <h3>Bulk actions</h3>
        <button onClick={() => archiveAll.mutate()}>Archive all chats</button>
        <button onClick={handleExport}>Export all chats (JSON)</button>
        {!confirmDelete ? (
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            Delete all chats
          </button>
        ) : (
          <div className="confirm-pane">
            <strong>This will permanently delete every chat.</strong>
            <button className="danger" onClick={() => deleteAll.mutate()}>
              Yes, delete all
            </button>
            <button onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        )}
      </section>
    </div>
  );
}
