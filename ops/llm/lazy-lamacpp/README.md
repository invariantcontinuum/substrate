# llama.cpp model stack

Systemd-first orchestration for a small local LLM stack built on `llama.cpp`.

This repository treats `make` as the primary operator interface and user-level
`systemd` as the primary runtime. It provisions five independently managed
services for embeddings, dense generation, sparse extraction, reranking, and
coding workloads. Each model can be downloaded, configured, started, stopped,
sampled, and replaced on its own, and the same repo can also manage the full
stack when the host has enough resources.

## What this repo does

- Builds `llama.cpp` locally with CPU BLAS support and CUDA when `nvcc` is available.
- Installs user-level `systemd` units for long-running model services.
- Downloads GGUF checkpoints from Hugging Face using a token stored in `.env`.
- Keeps tracked defaults in `config/` and writes mutable overrides to `runtime/config/`.
- Exposes a `make` interface for lifecycle control, model replacement, LoRA activation, and sample requests.
- Logs every `make` action to `logs/<target>-<timestamp>.log` while still streaming output to the terminal.

## Model catalog

| Model | Role | Default endpoint | Default port | Default device | Allowed devices | Default context | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `embeddings` | `google/embeddinggemma-300m` via `ggml-org/embeddinggemma-300M-GGUF` | `/v1/embeddings` | `8101` | `cpu` | `cpu` | `2048` | Embedding-only service with `cls` pooling. |
| `dense` | `Qwen/Qwen2.5-7B-Instruct-AWQ` mapped to `Qwen/Qwen2.5-7B-Instruct-GGUF` | `/v1/chat/completions` | `8102` | `gpu` | `cpu,gpu` | `8192` | Main reasoning and extraction model. Supports dynamic LoRA loading. |
| `sparse` | `HuggingFaceTB/SmolLM2-1.7B-Instruct` via `HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF` | `/v1/chat/completions` | `8103` | `gpu` | `cpu,gpu` | `8192` | Fast low-latency extraction and lightweight generation. |
| `reranker` | `BAAI/bge-reranker-v2-m3` via `gpustack/bge-reranker-v2-m3-GGUF` | `/v1/rerank` | `8104` | `gpu` | `cpu,gpu` | `8192` | Cross-encoder reranking service. |
| `coding` | `Jackrong/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF` | `/v1/chat/completions` | `8105` | `cpu` | `cpu,gpu` | `8192` | Coding model. GPU mode is supported, but defaults to conservative partial offload on this host. |

## Architecture

The control flow is simple:

1. `make` targets call shell helpers in `scripts/`.
2. Model defaults come from `config/models/*.env`.
3. Mutable overrides are written to `runtime/config/*.env`.
4. `systemd` starts `scripts/run-llama-server.sh <model>`.
5. `run-llama-server.sh` resolves the effective config and launches `llama-server`.

The repository is intentionally systemd-first. Docker is not the primary runtime
path here.

## Repository layout

```text
.
|-- Makefile
|-- .env.example
|-- config/
|   |-- models/              # tracked model defaults
|   `-- loras/               # tracked LoRA manifests
|-- data/                    # sample request payloads by model
|-- docs/
|   `-- system-capabilities.md
|-- logs/                    # make command transcripts
|-- runtime/
|   `-- config/              # mutable local overrides written by make
|-- scripts/                 # operational helpers
`-- systemd/user/            # user-level units
```

## Quick start

### 1. Seed `.env`

```bash
cp .env.example .env
make env-token HF_TOKEN=hf_your_token
```

The current `.env.example` contains:

```bash
HF_TOKEN=
HF_HOME=${HOME}/.cache/huggingface
HF_HUB_ENABLE_HF_TRANSFER=1
```

### 2. Install prerequisites

```bash
make install-prereqs
```

This target:

- installs OS packages such as `cmake`, `ninja-build`, `OpenBLAS`, `python3-venv`, `curl`, and `jq`
- creates `.venv`
- installs `huggingface_hub[cli]` and `nvitop`
- clones or updates `vendor/llama.cpp`
- builds `llama.cpp`
- refreshes the user `systemd` units

### 3. Download model files

```bash
make download-all
```

Or download one model at a time:

```bash
make download MODEL=embeddings
make download MODEL=dense
make download MODEL=sparse
make download MODEL=reranker
make download MODEL=coding
```

### 4. Install or refresh the user units

```bash
make systemd-install
```

This links:

- `systemd/user/llamacpp-model@.service`
- `systemd/user/llamacpp-stack.target`

into `~/.config/systemd/user/` and writes the project root to
`~/.config/llama-cpp-models/project.env`.

### 5. Start models

Examples:

```bash
make start MODEL=embeddings
make start MODEL=dense DEVICE=gpu
make start MODEL=sparse DEVICE=gpu
make start MODEL=reranker DEVICE=gpu
make start MODEL=coding DEVICE=cpu
```

## Primary commands

### Inspection

```bash
make help
make show MODEL=dense
make status MODEL=dense
make status-all
make logs MODEL=dense LINES=200
make logs-all LINES=200
```

### Lifecycle

```bash
make start MODEL=dense
make stop MODEL=dense
make restart MODEL=dense
make start-all
make stop-all
make restart-all
```

### Configuration and replacement

```bash
make configure MODEL=dense DEVICE=gpu GPU_LAYERS=99 CTX_SIZE=8192
make replace MODEL=sparse HF_REPO=HuggingFaceTB/SmolLM2-360M-Instruct-GGUF HF_FILE=smollm2-360m-instruct-q4_k_m.gguf
make env-token HF_TOKEN=hf_your_new_token
```

### Sampling and validation

```bash
make sample MODEL=dense SAMPLE=extract
make sample MODEL=embeddings SAMPLE=basic
make sample-all
make test-sequence
```

### Dense LoRA workflow

```bash
make lora-config MODEL=dense LORA=cypher HF_REPO=org/cypher-lora HF_FILE=adapter.gguf ENABLED=true
make lora-download MODEL=dense LORA=cypher
make lora-activate MODEL=dense LORAS=cypher,policy
make lora-deactivate MODEL=dense
```

## Configuration model

Tracked defaults live in `config/models/*.env`. Local mutable overrides are
written to `runtime/config/<model>.env`. LoRA overrides are written to
`runtime/config/loras/<model>.env`.

Effective precedence is:

1. Global environment from `.env`
2. Tracked model defaults in `config/models/<model>.env`
3. Local runtime overrides in `runtime/config/<model>.env`
4. For dense LoRAs only: tracked manifest in `config/loras/dense.env`
5. For dense LoRAs only: local overrides in `runtime/config/loras/dense.env`

This means `make configure` and `make start MODEL=... DEVICE=...` are not just
one-shot flags. They persist overrides to the local runtime config.

## Supported `make configure` keys

The Makefile supports these per-model override inputs:

| Input | Stored key | Meaning |
| --- | --- | --- |
| `DEVICE` | `MODEL_DEVICE` | `cpu` or `gpu` |
| `PORT` | `MODEL_PORT` | HTTP port for the service |
| `HOST` | `MODEL_HOST` | bind address |
| `CTX_SIZE` or `N_CTX` | `CONTEXT_SIZE` | llama.cpp context size |
| `THREADS` | `THREADS` | CPU thread count |
| `GPU_LAYERS` | `GPU_LAYERS` | number of offloaded layers |
| `CPU_BATCH` | `CPU_BATCH` | batch size for CPU mode |
| `CPU_UBATCH` | `CPU_UBATCH` | ubatch size for CPU mode |
| `GPU_BATCH` | `GPU_BATCH` | batch size for GPU mode |
| `GPU_UBATCH` | `GPU_UBATCH` | ubatch size for GPU mode |
| `DISPLAY_NAME` | `MODEL_DISPLAY_NAME` | human-readable model label |
| `SOURCE_REPO` | `MODEL_SOURCE_REPO` | upstream reference repo |
| `HF_REPO` | `MODEL_REPO` | GGUF repo used for download |
| `HF_FILE` | `MODEL_FILENAME` | entry GGUF file |
| `HF_PATTERN` | `MODEL_INCLUDE_PATTERN` | Hugging Face download pattern |
| `HF_REVISION` | `MODEL_REVISION` | branch, tag, or revision |
| `EXTRA_ARGS` | `SERVER_EXTRA_ARGS` | extra `llama-server` arguments |

Use `make show MODEL=<name>` to inspect the resolved runtime values.

## Device selection

Device switching is per model and persistent once written.

- `make start MODEL=<name> DEVICE=cpu` updates the runtime override and starts the service in CPU mode.
- `make start MODEL=<name> DEVICE=gpu` updates the runtime override and starts the service in GPU mode.
- `make restart MODEL=<name> DEVICE=...` behaves the same way.
- Runtime batch, ubatch, and `-ngl` are chosen from the model's CPU or GPU profile.

Current defaults:

- `embeddings` is CPU-only.
- `dense` defaults to GPU.
- `sparse` defaults to GPU.
- `reranker` defaults to GPU.
- `coding` defaults to CPU on this host because the `Q4_K_M` file is large enough that full offload is not a safe default on a 6 GiB laptop GPU.

`make start-all` exists, but it starts all declared services at once. On smaller
single-GPU hosts, the sequential flows are usually the practical choice:

- `make sample-all`
- `make test-sequence`

## Model replacement

Use `make replace` when you want to swap a configured model to another Hugging
Face repo or file and download it immediately.

Example:

```bash
make replace \
  MODEL=dense \
  HF_REPO=Qwen/Qwen2.5-7B-Instruct-GGUF \
  HF_FILE=qwen2.5-7b-instruct-q5_k_m-00001-of-00002.gguf \
  HF_PATTERN=qwen2.5-7b-instruct-q5_k_m-*.gguf
```

Notes:

- `HF_FILE` is the exact filename `llama-server` will use at runtime.
- `HF_PATTERN` controls which files `snapshot_download()` pulls.
- Split GGUF models must use a pattern that matches all shards.

## Dense LoRA management

The `dense` model can preload multiple LoRAs and activate them dynamically
through the `llama-server` LoRA adapter endpoint.

Tracked manifest:

- `config/loras/dense.env`

Available logical LoRA slots:

- `extract`
- `explain`
- `cypher`
- `resolve`
- `policy`

Typical flow:

```bash
make lora-config MODEL=dense LORA=extract HF_REPO=org/extract-lora HF_FILE=adapter.gguf ENABLED=true
make lora-download MODEL=dense LORA=extract
make restart MODEL=dense
make lora-activate MODEL=dense LORAS=extract
```

What the commands do:

- `lora-config` writes repo, filename, revision, scale, and enabled state to the local LoRA override file.
- `lora-download` downloads the LoRA GGUF into `models/dense/loras/<name>/`.
- `restart` is needed so the service preloads enabled local LoRA files.
- `lora-activate` posts the active scales to `/lora-adapters`.
- `lora-deactivate` sets all active scales to zero.

## Sample requests and metrics

Sample request payloads live under:

```text
data/<model>/<sample>/request.json
```

Current samples:

- `data/embeddings/basic/request.json`
- `data/embeddings/long-context/request.json`
- `data/dense/extract/request.json`
- `data/sparse/entities/request.json`
- `data/reranker/basic/request.json`
- `data/coding/refactor/request.json`

For a heavier embeddings run, use:

```bash
make sample MODEL=embeddings SAMPLE=long-context
```

If you actually want to exercise a much larger embedding window on this host,
raise the embeddings context first, because the tracked default is still `2048`:

```bash
make configure MODEL=embeddings CTX_SIZE=128000
make restart MODEL=embeddings
make sample MODEL=embeddings SAMPLE=long-context
```

`make sample MODEL=<name> [SAMPLE=<name>]`:

- requires the target service to already be active
- waits for the model health endpoint before sending the request
- prints a formatted response preview
- reports endpoint-appropriate metrics

Metrics reported by service type:

- generation models: HTTP status, total latency, time to first byte, prompt tokens, completion tokens, total tokens, output speed
- embeddings: HTTP status, total latency, time to first byte, input items, embeddings returned, vector dimensions, prompt tokens
- reranker: HTTP status, total latency, time to first byte, documents submitted, results returned, prompt tokens, best score

`make sample-all`:

- stops any currently running model services
- starts each selected model one by one
- runs the default sample for each
- leaves the last model running

`make test-sequence`:

- starts each selected model one by one
- verifies the unit reaches `active/running`
- stops each model before moving to the next
- leaves the last model running

## Logging and observability

There are two log layers:

### Make command logs

Every top-level `make` target runs through `scripts/run-with-log.sh` and writes:

```text
logs/<target>-<timestamp>.log
```

Those logs include:

- action name
- timestamp
- working directory
- exact command line
- streamed stdout and stderr

The same output is shown in the terminal while the file is being written.

### Service runtime logs

The `systemd` units send `llama-server` stdout and stderr to the journal.

Use:

```bash
make logs MODEL=dense
make logs-all
journalctl --user -u llamacpp-model@dense.service -f
```

`make start` and `make restart` also print a post-start `systemctl status`
snapshot so the command log captures the effective command line and recent
journal lines.

## Systemd design

Main unit:

- `systemd/user/llamacpp-model@.service`

Stack target:

- `systemd/user/llamacpp-stack.target`

The model service uses:

- `Restart=on-failure`
- `RestartSec=5`
- `TimeoutStartSec=120`
- `KillSignal=SIGINT`

Each model is started with:

```bash
scripts/run-llama-server.sh <model>
```

which resolves the final config and launches `llama-server` with the correct:

- host
- port
- model path
- context size
- threads
- batch and ubatch
- parallel request slots
- GPU layers
- server mode flags such as `--embedding` or `--reranking`
- optional LoRA preload arguments

## Hugging Face authentication

Hugging Face downloads use the token in `.env`.

Set or rotate it with:

```bash
make env-token HF_TOKEN=hf_your_new_token
```

Optional related environment values:

- `HF_HOME`
- `HF_HUB_ENABLE_HF_TRANSFER`
- `HF_PYTHON_BIN`
- `LLAMA_SERVER_BIN`

`HF_REPO`, `HF_FILE`, `HF_PATTERN`, and `HF_REVISION` are per-model settings,
not global environment variables.

## Host notes

The host capability summary is captured in `docs/system-capabilities.md`.

This repository was tuned on a machine with:

- AMD Ryzen 7 6800H
- 30 GiB system RAM
- NVIDIA RTX 3060 Laptop GPU with 6 GiB VRAM

That is enough for the default split here, but not enough headroom to assume all
GPU-oriented services should run concurrently.

## Compatibility notes

- `llama.cpp` serves GGUF checkpoints, not raw AWQ or standard Transformers weights.
- The `dense` service therefore uses the GGUF mapping of the requested Qwen AWQ model.
- The `embeddings` service is configured to the current local runtime setting of `2048` context, not the upstream marketing maximum.
- The repo is intentionally optimized for `make + systemd` as the primary operator flow.

## Troubleshooting

### `make start` succeeds but the model is still loading

Use:

```bash
make logs MODEL=<name>
```

or

```bash
journalctl --user -u llamacpp-model@<name>.service -f
```

The `sample` command already waits for `GET /health` before sending the request.

### A model file was downloaded but start fails

Run:

```bash
make show MODEL=<name>
```

and confirm:

- `HF_REPO`
- `HF_FILE`
- `HF_PATTERN`
- `LOCAL_FILE`

all match the files present under `models/<name>/`.

### GPU mode is unstable or OOMs

Lower the offload and batch settings:

```bash
make configure MODEL=coding DEVICE=gpu GPU_LAYERS=20 GPU_BATCH=256 GPU_UBATCH=128
make restart MODEL=coding
```

### The units do not refresh after changes

Run:

```bash
make systemd-install
systemctl --user daemon-reload
```

## License and contribution note

This repository is structured like an operator toolkit. If you extend it, prefer:

- tracked defaults in `config/`
- mutable machine-specific state in `runtime/`
- thin `make` targets over direct one-off shell use
- separate commits by concern using conventional commit messages
