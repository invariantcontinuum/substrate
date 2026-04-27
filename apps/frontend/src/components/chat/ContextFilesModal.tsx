import { Modal } from "@/components/ui/Modal";
import { Link } from "react-router-dom";
import {
  useThreadContextFiles,
  usePatchThreadContextFiles,
} from "@/hooks/useThreadContextFiles";

/**
 * Per-thread file selector. When ``threadId`` is null we still render
 * the modal (the budget pill always opens it) but with a friendly
 * empty-state pointing the user at Settings → Chat Context, since
 * file-level checkboxes only exist after a thread has been created.
 */
export function ContextFilesModal({
  threadId,
  isOpen,
  onClose,
}: {
  threadId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Context files"
      size="md"
      contentClassName="ctx-files-modal"
    >
      {threadId ? (
        <ContextFilesBody threadId={threadId} />
      ) : (
        <div className="ctx-files-empty">
          <p>
            File-level checkboxes appear once you've sent the first
            message in this chat — that's when the retrieval pipeline
            attaches files to the thread.
          </p>
          <p>
            To change the planned scope (snapshots + communities) used
            by every new chat, edit{" "}
            <Link to="/account/chat-context" onClick={onClose}>
              Settings → Chat Context
            </Link>
            .
          </p>
        </div>
      )}
    </Modal>
  );
}

function ContextFilesBody({ threadId }: { threadId: string }) {
  const { data } = useThreadContextFiles(threadId);
  const patch = usePatchThreadContextFiles(threadId);

  if (!data) return <p className="muted">Loading context files…</p>;
  if (data.files.length === 0) {
    return (
      <p className="muted">
        No files attached yet. Files are attached when the first message
        is processed by the retrieval pipeline.
      </p>
    );
  }
  return (
    <>
      <p className="muted ctx-files-budget">
        <strong>{data.totals.included_token_total.toLocaleString()}</strong>{" "}
        of {data.totals.all_token_total.toLocaleString()} tokens included.
        Uncheck files to fit a smaller budget.
      </p>
      <ul className="ctx-files-list">
        {data.files.map((f) => {
          const filename = f.path.split("/").pop() || f.path;
          const dirname = f.path.includes("/")
            ? f.path.slice(0, f.path.lastIndexOf("/"))
            : "";
          return (
            <li
              key={f.file_id}
              className={`ctx-files-item${f.included ? " is-included" : ""}`}
            >
              <label className="ctx-files-row">
                <input
                  type="checkbox"
                  checked={f.included}
                  onChange={() =>
                    patch.mutate([
                      { file_id: f.file_id, included: !f.included },
                    ])
                  }
                />
                <div className="ctx-files-meta">
                  <div className="ctx-files-name-row">
                    <span className="ctx-files-name" title={f.path}>
                      {filename}
                    </span>
                    {f.language && (
                      <span className="ctx-files-lang">{f.language}</span>
                    )}
                  </div>
                  {dirname && (
                    <span className="ctx-files-path" title={f.path}>
                      {dirname}/
                    </span>
                  )}
                </div>
                <span className="ctx-files-tokens">
                  {f.total_tokens.toLocaleString()}
                  <span className="ctx-files-tokens-label"> tok</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
