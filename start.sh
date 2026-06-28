#!/usr/bin/env bash
# Launch the Python AI layer and the Node.js backend in one container.
# If either process exits, stop the other so the container is restarted.
set -euo pipefail

APP_ROOT="/app"
AI_PORT="${AI_PORT:-8000}"

cleanup() {
  trap - TERM INT
  [[ -n "${AI_PID:-}" ]] && kill "$AI_PID" 2>/dev/null || true
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup TERM INT

# AI layer (FastAPI) bound to loopback only; reached by the backend via AI_LAYER_URL.
"${VENV_PATH:-/opt/venv}/bin/python" -m uvicorn app:app \
  --app-dir "$APP_ROOT/ai_layer" \
  --host 127.0.0.1 \
  --port "$AI_PORT" &
AI_PID=$!

# Backend (Express). CWD is backend/ so sample Assets resolve to /app/Assets.
cd "$APP_ROOT/backend"
node src/index.js &
BACKEND_PID=$!

# Exit as soon as either process stops, then clean up the survivor.
wait -n "$AI_PID" "$BACKEND_PID"
EXIT_CODE=$?
cleanup
exit "$EXIT_CODE"
