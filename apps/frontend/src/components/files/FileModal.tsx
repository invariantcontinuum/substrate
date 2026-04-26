import { useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { useFileByPath } from "@/hooks/useFileByPath";

/**
 * Read-only file preview modal. Two callers:
 *
 * - The chat EvidenceChip — passes ``filepath`` + ``highlightLines`` so
 *   the modal opens scrolled to the cited region with the lines
 *   visually highlighted.
 * - Future "view file" entry points elsewhere in the app — they can
 *   reuse the same component without any modification.
 *
 * Resolution: the chat-evidence row carries only a repo-relative path;
 * ``useFileByPath`` joins to the file_embeddings table via the user's
 * loaded sync set to obtain a file_id, then GETs the reconstructed
 * content. When no syncs are loaded or the path isn't present the
 * modal renders an explanatory message instead of an empty viewer.
 */
export function FileModal({
  open,
  onClose,
  filepath,
  highlightLines,
}: {
  open: boolean;
  onClose: () => void;
  filepath: string;
  highlightLines?: [number, number];
}) {
  const { content, isLoading, isError, notFound } = useFileByPath(
    open ? filepath : null,
  );
  const preRef = useRef<HTMLPreElement | null>(null);

  // Scroll the highlighted region into view once the content lands. We
  // do this in an effect (not during render) so that the DOM nodes
  // exist by the time we ask the line element for its offsetTop.
  useEffect(() => {
    if (!open || !highlightLines || !content || !preRef.current) return;
    const target = preRef.current.querySelector<HTMLDivElement>(
      `[data-line="${highlightLines[0]}"]`,
    );
    if (target) {
      // ``block: "center"`` keeps the cited region in the middle of the
      // viewer; users immediately see the surrounding context, not just
      // the first line of the citation flush against the modal's top.
      target.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [open, content, highlightLines]);

  if (!open) return null;

  const lines = (content?.content ?? "").split("\n");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={filepath}
      size="lg"
      contentClassName="file-modal-dialog"
    >
      {isLoading && <p className="muted">Loading…</p>}
      {isError && <p className="muted">Failed to load file content.</p>}
      {notFound && (
        <p className="muted">
          This file is not part of any sync currently loaded into your
          context. Load the matching sync from the Sources page to view
          its content.
        </p>
      )}
      {content && (
        <pre ref={preRef} className="file-modal-pre">
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const highlighted =
              highlightLines &&
              lineNum >= highlightLines[0] &&
              lineNum <= highlightLines[1];
            return (
              // Line ordering is stable for a given file content
              // snapshot, so the line number doubles as a safe React
              // key without needing a synthetic id.
              <div
                key={lineNum}
                className={`file-modal-line${highlighted ? " is-highlighted" : ""}`}
                data-line={lineNum}
              >
                <span className="file-modal-lineno">{lineNum}</span>
                <code>{line || " "}</code>
              </div>
            );
          })}
        </pre>
      )}
    </Modal>
  );
}
