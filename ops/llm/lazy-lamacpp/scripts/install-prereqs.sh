#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_global_env
ensure_project_dirs

APT_GET=()
if [[ $EUID -eq 0 ]]; then
  APT_GET=(apt-get)
elif command -v sudo >/dev/null 2>&1; then
  APT_GET=(sudo apt-get)
else
  fail "run this script as root or install sudo"
fi

"${APT_GET[@]}" update
"${APT_GET[@]}" install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  cmake \
  curl \
  git \
  jq \
  libopenblas-dev \
  ninja-build \
  pkg-config \
  python3-pip \
  python3-venv

python3 -m venv "$ROOT_DIR/.venv"
"$ROOT_DIR/.venv/bin/pip" install --upgrade pip
"$ROOT_DIR/.venv/bin/pip" install 'huggingface_hub[cli]' nvitop

if [[ -d "$ROOT_DIR/vendor/llama.cpp/.git" ]]; then
  git -C "$ROOT_DIR/vendor/llama.cpp" fetch --all --tags --prune
  git -C "$ROOT_DIR/vendor/llama.cpp" checkout master
  git -C "$ROOT_DIR/vendor/llama.cpp" pull --ff-only
else
  git clone https://github.com/ggml-org/llama.cpp.git "$ROOT_DIR/vendor/llama.cpp"
fi

CUDA_FLAG=OFF
if command -v nvcc >/dev/null 2>&1; then
  CUDA_FLAG=ON
fi

cmake -S "$ROOT_DIR/vendor/llama.cpp" \
  -B "$ROOT_DIR/vendor/llama.cpp/build" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_BLAS=ON \
  -DGGML_BLAS_VENDOR=OpenBLAS \
  -DGGML_CUDA="$CUDA_FLAG"

cmake --build "$ROOT_DIR/vendor/llama.cpp/build" -j"$(nproc)"

"$ROOT_DIR/scripts/systemd-install.sh"

