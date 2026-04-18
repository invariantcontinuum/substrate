# System capability report

Generated from local inspection on 2026-04-08.

## Host inventory

- OS: Ubuntu 24.04.4 LTS on Windows 10 (WSL2)
- systemd: 255
- CPU: AMD Ryzen 7 6800H, 8 cores / 16 threads, AVX2 and FMA available
- Memory: 15.6 GiB total, about 10 GiB available at inspection time
- GPU: NVIDIA GeForce RTX 3060 Laptop GPU, 6 GiB VRAM
- Driver / CUDA: NVIDIA driver 566.07, CUDA runtime 12.7, `nvcc` 12.0.140
- Disk: 929 GiB free on `/`

## Practical llama.cpp implications

- CPU inference is viable for embeddings, reranking, and coding models.
- GPU offload is viable for 4-bit GGUF models. The 6 GiB RTX 3060 is a reasonable fit for `Qwen2.5-7B-Instruct` (approx 5GB) in Q4 with an 8k context target, but it pushes the VRAM limit when other models are loaded.
- `Jackrong/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF` (approx 6GB) in `Q4_K_M` should be treated as CPU-backed or partial offload to avoid OOM.
- A 15.6 GiB RAM budget is tight for keeping all models resident. The stack should be managed sequentially (one model at a time) or with aggressive swap usage.
- Disk capacity is not a constraint for the configured stack.

## Compatibility notes

- `google/embeddinggemma-300m` is configured through `ggml-org/embeddinggemma-300M-GGUF`.
- `Qwen/Qwen2.5-7B-Instruct-AWQ` is not directly consumable by llama.cpp, so the stack uses `Qwen/Qwen2.5-7B-Instruct-GGUF`.
- `llama.cpp` was built with CUDA support using the installed `nvidia-cuda-toolkit`.
