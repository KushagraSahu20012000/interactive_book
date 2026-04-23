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

# Load local environment variables for AI providers.
if [[ -f "$SCRIPT_DIR/.env" ]]; then
	set -a
	source "$SCRIPT_DIR/.env"
	set +a
elif [[ -f "$SCRIPT_DIR/.env.example" ]]; then
	set -a
	source "$SCRIPT_DIR/.env.example"
	set +a
fi

exec "$PYTHON_BIN" -m uvicorn app:app --app-dir "$SCRIPT_DIR" --host "$HOST" --port "$PORT"
