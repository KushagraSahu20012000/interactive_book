#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_VENV_PYTHON="$SCRIPT_DIR/../../.venv/bin/python"
if [[ -x "$DEFAULT_VENV_PYTHON" ]]; then
	PYTHON_BIN="${PYTHON_BIN:-$DEFAULT_VENV_PYTHON}"
else
	PYTHON_BIN="${PYTHON_BIN:-python3}"
fi
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

# Load local environment variables for AI providers when a real .env is present.
# Do NOT source .env.example at runtime because placeholder values can override
# provider secrets injected by deployment platforms (for example HF Spaces).
if [[ -f "$SCRIPT_DIR/.env" ]]; then
	set -a
	source "$SCRIPT_DIR/.env"
	set +a
fi

exec "$PYTHON_BIN" -m uvicorn app:app --app-dir "$SCRIPT_DIR" --host "$HOST" --port "$PORT"
