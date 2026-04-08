# Lazy LlamaCPP - Agent Instructions

## Overview

This repository provides a systemd-managed local LLM stack built on `llama.cpp`. It serves multiple model roles via independent HTTP endpoints.

**Model Roles & Ports:**
- **Embeddings**: `8101` (`google/embeddinggemma-300m`)
- **Dense**: `8102` (`Qwen2.5-7B-Instruct`) - Main reasoning/extraction
- **Sparse**: `8103` (`SmolLM2-1.7B-Instruct`) - Fast extraction
- **Reranker**: `8104` (`BAAI/bge-reranker-v2-m3`)
- **Coding**: `8105` (`Qwen3.5-9B`)

---

## Critical Mandate: On-Demand Startup

**Services in this stack should be started ON DEMAND.**

Due to memory constraints (15.6 GiB RAM, 6 GiB VRAM), running all models concurrently is not recommended. When another locally running service (e.g., in `home-stack` or a standalone app) needs an LLM capability:

1. **Check if the required model is running:**
   ```bash
   make status MODEL=<name>
   ```

2. **Start the model if needed:**
   ```bash
   make start MODEL=<name>
   ```

3. **Verify health before use:**
   Wait for the model to be ready by checking the `/health` endpoint or using:
   ```bash
   make sample MODEL=<name>
   ```

---

## Verification & Management

**Build Prerequisites:**
If `llama-server` is missing or needs a CUDA rebuild:
```bash
make install-prereqs
```

**Resource Strategy:**
- Use `DEVICE=gpu` for `dense`, `sparse`, and `reranker` (fits in 6GB VRAM).
- Use `DEVICE=cpu` for `coding` and `embeddings`.
- If system memory is tight, stop unused models:
  ```bash
  make stop MODEL=<name>
  ```

**Logs:**
- View model logs: `make logs MODEL=<name>`
- View systemd journal: `journalctl --user -u llamacpp-model@<name>.service -f`

---

## API Usage

All models provide an OpenAI-compatible API (where applicable) at `http://127.0.0.1:<PORT>/v1`.

- **Chat/Completions**: `dense`, `sparse`, `coding`
- **Embeddings**: `embeddings`
- **Rerank**: `reranker` (specific `/v1/rerank` endpoint)

*Note: Always verify the model is active before sending requests from other services.*
