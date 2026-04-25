import {
  useThreadContextFiles,
  usePatchThreadContextFiles,
} from "@/hooks/useThreadContextFiles";

export function ContextFilesModal({
  threadId,
  isOpen,
  onClose,
}: {
  threadId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data } = useThreadContextFiles(threadId);
  const patch = usePatchThreadContextFiles(threadId);
  if (!isOpen || !data) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-body"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h3>Context files</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="muted">
          {data.totals.included_token_total.toLocaleString()} of{" "}
          {data.totals.all_token_total.toLocaleString()} tokens included.
          Uncheck files to fit a smaller budget.
        </p>
        <ul className="ctx-files-list">
          {data.files.map((f) => (
            <li key={f.file_id}>
              <label>
                <input
                  type="checkbox"
                  checked={f.included}
                  onChange={() =>
                    patch.mutate([
                      { file_id: f.file_id, included: !f.included },
                    ])
                  }
                />
                <span className="path">{f.path}</span>
                <span className="lang">{f.language ?? "—"}</span>
                <span className="tok">
                  {f.total_tokens.toLocaleString()} tok
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
