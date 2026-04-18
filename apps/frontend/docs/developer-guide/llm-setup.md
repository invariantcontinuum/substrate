# Local LLM & Embedding Setup

Substrate relies on **lazy-lamacpp** for local, privacy-first AI inference. This ensures that your source code never leaves your infrastructure.

---

## Required Models

| Model Role | Service Name | Default Port | Model Recommendation |
|------------|--------------|--------------|----------------------|
| **Embeddings** | `llamacpp-model@embeddings` | 8101 | `Qwen3-Embedding-0.6B` |
| **Summaries** | `llamacpp-model@dense` | 8102 | `Qwen2.5-7B-Instruct` |

---

## Verification

You can verify the status of the local LLM stack using the `make` commands in the `lazy-lamacpp` directory:

```bash
cd ~/github/lazy-lamacpp
make status MODEL=embeddings
make status MODEL=dense
```

If a service is inactive, start it:
```bash
make start MODEL=embeddings
```

---

## Common LLM Issues

### 1. "400 Bad Request" (Embedding Service)
**Symptom:** Ingestion logs show `embed_batch_failed status=400`.
**Reason:** This usually occurs when a single file's content exceeds the model's context window or the server's input buffer.
**Substrate Handling:** The ingestion service implements a **Bisection Logic** for embeddings:
- If a batch of 32 files fails with a 400, it splits the batch into two groups of 16.
- It recursively narrows down until it identifies the specific "poison-pill" file.
- The offending file is recorded as having `None` for its embedding, allowing the rest of the sync to continue.

### 2. Slow Summary Generation
**Symptom:** "Generating summary..." in the UI takes >10 seconds.
**Reason:** Dense models (7B+) are compute-intensive. If running on CPU, generation will be slow.
**Solution:** Ensure the model is being offloaded to a GPU. Check the `lazy-lamacpp/config/<model>.env` for `-ngl` (number of GPU layers) settings.

### 3. Model Memory Contention
**Symptom:** One model crashes when another starts.
**Reason:** Insufficient VRAM to hold multiple models simultaneously.
**Solution:** Substrate uses an on-demand loading strategy. You can stop unused models using `make stop MODEL=<name>`.
