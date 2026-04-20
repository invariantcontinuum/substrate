# Lazy LlamaCPP - Agent Instructions

## Overview

This repository provides a systemd-managed local LLM stack built on `llama.cpp`. It serves multiple model roles via independent HTTP endpoints.

**Model Roles & Default Ports:**
- **Embeddings**: `8101` - Text embedding models
- **Dense**: `8102` - Main reasoning/extraction models
- **Sparse**: `8103` - Fast extraction models
- **Reranker**: `8104` - Reranking models
- **Coding**: `8105` - Code generation models

> **Note:** Model assignments are flexible. Any model can be configured for any role based on user requirements.

---

## Critical Mandate: Systemd User Units

All model services **must** be started and managed as **systemd user units** (`llamacpp-model@<name>.service`). Never run `llama-server` directly outside of systemd unless explicitly instructed for debugging.

```bash
# Start via systemd user unit
make start MODEL=<name>

# Check status
systemctl --user status llamacpp-model@<name>.service
```

---

## Critical Mandate: REST API Only (No Web UI)

All model services **must** run with the Web UI disabled. Only the OpenAI-compatible REST API should be exposed.

Runtime configs must include:
```bash
SERVER_EXTRA_ARGS=--no-webui
```

This is enforced per model in `runtime/config/<model>.env`.

---

## Critical Mandate: Simultaneous GPU Operation

**Embeddings and Dense MUST both run on GPU concurrently.**

The substrate stack requires both services to be available at all times. With the current 4 GB VRAM budget, this is achieved by:

- **jina-code-embeddings-0.5b Q8_0** on GPU at port 8101 with **32768 context**
- **Qwen3.5-2B Q8_0** on GPU at port 8102 with **60416 context**

Both models use Q8_0 KV cache quantization to maximize quality within the memory budget. Total VRAM usage is ~4007 MiB / 4096 MiB, leaving ~25 MiB headroom.

Other models (sparse, reranker, coding) are still started on-demand and should NOT run concurrently with dense + embeddings on this GPU.

### Starting the required pair

```bash
make start MODEL=embeddings
make start MODEL=dense
```

### Verify both are healthy

```bash
make status MODEL=embeddings
make status MODEL=dense
```

---

## Resource Strategy

### Device Assignment (CPU vs GPU)

Device assignment is **configurable per model** based on your needs:

- **Use GPU when:**
  - Model is large (>2B parameters)
  - High throughput is required
  - Latency is critical
  - VRAM is available

- **Use CPU when:**
  - Model is small and performs well on CPU
  - GPU VRAM is needed for other models
  - Power consumption is a concern

### Default Configurations

| Model Role | Default Device | Context | KV Cache | Notes |
|------------|---------------|---------|----------|-------|
| embeddings | gpu | 32768 | Q8_0 | Runs concurrently with dense |
| dense | gpu | 60416 | Q8_0 | Runs concurrently with embeddings |
| sparse | gpu | 16384 | Q8_0 | Start on-demand only |
| reranker | gpu | 32768 | Q8_0 | Start on-demand only |
| coding | cpu | 32768 | Q8_0 | 9B model, too large for 4 GB GPU |

### Changing Device

To change a model's device:
```bash
make configure MODEL=<name> DEVICE=gpu  # or DEVICE=cpu
make restart MODEL=<name>
```

### Runtime Overrides

Per-model runtime overrides are stored in `runtime/config/<model>.env`. Agents must check and correct these files when a model is not behaving as expected (e.g. CPU override accidentally pinning a model to CPU).

Common runtime overrides:
- `MODEL_DEVICE=gpu|cpu`
- `GPU_LAYERS=99|0`
- `SERVER_EXTRA_ARGS=--no-webui`

**Important:** The runtime config takes precedence over the base config. If `nvidia-smi` or journal logs show a model running on CPU despite the base config saying GPU, inspect `runtime/config/<model>.env` first.

---

## Model Flexibility

### Changing Models

Any model role can be reconfigured to use a different GGUF model:

```bash
# Replace with a new model
make replace MODEL=<role> HF_REPO=<repo> HF_FILE=<filename.gguf> [DEVICE=gpu|cpu]

# Example: Change embeddings to a different model
make replace MODEL=embeddings HF_REPO=Qwen/Qwen3-Embedding-0.6B-GGUF HF_FILE=Qwen3-Embedding-0.6B-Q8_0.gguf DEVICE=gpu
```

### Available Operations

| Command | Purpose |
|---------|---------|
| `make show MODEL=<name>` | Display current configuration |
| `make configure MODEL=<name> DEVICE=gpu` | Change device |
| `make replace MODEL=<name> HF_REPO=... HF_FILE=...` | Change model |
| `make download MODEL=<name>` | Download configured model |
| `make start MODEL=<name>` | Start the service |
| `make stop MODEL=<name>` | Stop the service |
| `make restart MODEL=<name>` | Restart the service |
| `make status MODEL=<name>` | Check service status |
| `make sample MODEL=<name>` | Test the model |

---

## Verification & Management

**Build Prerequisites:**
If `llama-server` is missing or needs a CUDA rebuild:
```bash
make install-prereqs
```

**Resource Management:**
If system memory is tight, stop unused models:
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
