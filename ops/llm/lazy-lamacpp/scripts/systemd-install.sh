#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

load_global_env
ensure_project_dirs

SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SYSTEMD_STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/llama-cpp-models"

mkdir -p "$SYSTEMD_USER_DIR" "$SYSTEMD_STATE_DIR"

cat > "$SYSTEMD_STATE_DIR/project.env" <<EOF
PROJECT_ROOT=$ROOT_DIR
EOF

ln -sfn "$ROOT_DIR/systemd/user/llamacpp-model@.service" "$SYSTEMD_USER_DIR/llamacpp-model@.service"
ln -sfn "$ROOT_DIR/systemd/user/llamacpp-stack.target" "$SYSTEMD_USER_DIR/llamacpp-stack.target"

systemctl --user daemon-reload

printf '%s\n' "Installed user units in $SYSTEMD_USER_DIR"
