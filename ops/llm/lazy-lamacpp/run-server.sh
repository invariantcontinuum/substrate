#!/bin/bash
# Simple OpenAI-compatible llama.cpp server
# Usage: ./run-server.sh <model.gguf> [port] [gpu_layers]

set -e

MODEL="${1:-models/embeddings/Qwen3-Embedding-0.6B-Q8_0.gguf}"
PORT="${2:-8101}"
GPU_LAYERS="${3:-99}"

# Find llama-server
LLAMA_SERVER="./vendor/llama.cpp/build/bin/llama-server"
[[ -x "$LLAMA_SERVER" ]] || { echo "llama-server not found at $LLAMA_SERVER"; exit 1; }

# Check model exists
[[ -f "$MODEL" ]] || { echo "Model not found: $MODEL"; exit 1; }

echo "Starting OpenAI-compatible llama.cpp server"
echo "  Model: $MODEL"
echo "  Port: $PORT"
echo "  GPU Layers: $GPU_LAYERS"
echo "  API: http://127.0.0.1:$PORT/v1"
echo ""
echo "Endpoints:"
echo "  POST /v1/embeddings  - Generate embeddings"
echo "  POST /v1/completions - Text completion"
echo "  POST /v1/chat/completions - Chat completion"
echo "  GET  /health         - Health check"
echo ""

# Auto-detect embedding mode
if [[ "$MODEL" == *"embed"* ]] || [[ "$MODEL" == *"Embedding"* ]]; then
  echo "Mode: EMBEDDING (auto-detected)"
  MODE_ARGS="--embedding --pooling last"
else
  echo "Mode: CHAT/COMPLETION"
  MODE_ARGS=""
fi

exec "$LLAMA_SERVER" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --model "$MODEL" \
  -c 8192 \
  -t 12 \
  -ngl "$GPU_LAYERS" \
  --api-key "" \
  $MODE_ARGS
