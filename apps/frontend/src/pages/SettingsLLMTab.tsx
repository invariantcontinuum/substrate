import { LLMConnectionCard } from "@/components/modals/tabs/LLMConnectionCard";

export function SettingsLLMTab() {
  return (
    <section className="settings-llm">
      <h3>LLM Connections</h3>
      <div className="llm-grid">
        <LLMConnectionCard
          role="dense"
          title="Dense"
          fields={[
            { key: "dense_llm_url", label: "URL" },
            { key: "dense_llm_model", label: "Model" },
            { key: "dense_llm_context_size", label: "Context size", type: "number" },
            { key: "chat_llm_timeout_s", label: "Timeout (s)", type: "number" },
          ]}
        />
        <LLMConnectionCard
          role="sparse"
          title="Sparse"
          fields={[
            { key: "sparse_llm_url", label: "URL" },
            { key: "sparse_llm_model", label: "Model" },
            { key: "sparse_llm_context_size", label: "Context size", type: "number" },
            { key: "sparse_keyword_top_k", label: "Top-K", type: "number" },
            { key: "sparse_llm_timeout_s", label: "Timeout (s)", type: "number" },
          ]}
        />
        <LLMConnectionCard
          role="embedding"
          title="Embedding"
          fields={[
            { key: "embedding_url", label: "URL" },
            { key: "embedding_model", label: "Model" },
            { key: "embedding_dim", label: "Dim", type: "number", readonly: true },
            { key: "embedding_max_input_chars", label: "Max input chars", type: "number" },
            { key: "embed_batch_size", label: "Batch size", type: "number" },
            { key: "embedding_document_prefix", label: "Doc prefix" },
            { key: "embedding_query_prefix", label: "Query prefix" },
          ]}
        />
        <LLMConnectionCard
          role="reranker"
          title="Reranker"
          fields={[
            { key: "reranker_url", label: "URL" },
            { key: "reranker_model", label: "Model" },
            { key: "reranker_top_n", label: "Top-N", type: "number" },
            { key: "reranker_timeout_s", label: "Timeout (s)", type: "number" },
          ]}
        />
      </div>
    </section>
  );
}
