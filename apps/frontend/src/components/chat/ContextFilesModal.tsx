import { Modal } from "@/components/ui/Modal";
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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Context files"
      size="md"
      contentClassName="ctx-files-modal"
    >
      {data ? (
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
                <li key={f.file_id} className={`ctx-files-item${f.included ? " is-included" : ""}`}>
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
                        <span className="ctx-files-name" title={f.path}>{filename}</span>
                        {f.language && (
                          <span className="ctx-files-lang">{f.language}</span>
                        )}
                      </div>
                      {dirname && (
                        <span className="ctx-files-path" title={f.path}>{dirname}/</span>
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
      ) : (
        <p className="muted">Loading context files…</p>
      )}
    </Modal>
  );
}
