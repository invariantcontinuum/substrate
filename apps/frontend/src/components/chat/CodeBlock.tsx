import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { codeToHtml } from "shiki";

interface Props {
  code: string;
  language?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[c] as string);
}

export function CodeBlock({ code, language = "text" }: Props) {
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    void (async () => {
      try {
        const out = await codeToHtml(code, {
          lang: language,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        });
        if (!cancelled.current) setHtml(out);
      } catch {
        if (!cancelled.current) setHtml(`<pre>${escapeHtml(code)}</pre>`);
      }
    })();
    return () => { cancelled.current = true; };
  }, [code, language]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard permission denied / non-HTTPS / browser quirk — silently skip;
      // the user can still select+copy manually from the highlighted block.
    }
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          type="button"
          className="code-block-copy"
          onClick={() => void onCopy()}
          aria-label="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <div
        className="code-block-body"
        dangerouslySetInnerHTML={{ __html: html || `<pre>${escapeHtml(code)}</pre>` }}
      />
    </div>
  );
}
