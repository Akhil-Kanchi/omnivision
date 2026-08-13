#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend/live-bridge"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.logs"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8082}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_URL="http://$BACKEND_HOST:$BACKEND_PORT"
FRONTEND_URL="http://$FRONTEND_HOST:$FRONTEND_PORT"
LIVE_TUTOR_URL="$FRONTEND_URL/ohmlet-app"

BACKEND_PID_FILE="$LOG_DIR/live-bridge.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/live-bridge.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR"

is_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

health_ok() {
  curl -fsS -m 3 "$BACKEND_URL/health" >/dev/null 2>&1
}

frontend_ok() {
  curl -fsS -m 3 "$LIVE_TUTOR_URL" >/dev/null 2>&1
}

stop_from_pid_file() {
  local pid_file="$1"
  local name="$2"

  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    echo "Stopping $name (pid $pid)"
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

stop_port() {
  local port="$1"
  local name="$2"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Stopping $name on port $port"
    kill $pids >/dev/null 2>&1 || true
  fi
}

stop_live_tutor() {
  stop_from_pid_file "$FRONTEND_PID_FILE" "frontend"
  stop_from_pid_file "$BACKEND_PID_FILE" "live bridge"
  stop_port "$FRONTEND_PORT" "frontend"
  stop_port "$BACKEND_PORT" "live bridge"
}

ensure_backend_env() {
  local env_file="$BACKEND_DIR/.env"

  if [[ ! -f "$env_file" ]]; then
    echo "Missing backend env file: $env_file"
    echo "Create it with GOOGLE_API_KEY=your_gemini_key, then run this again."
    exit 1
  fi

  local key
  key="$(awk -F= '/^GOOGLE_API_KEY=/{print $2}' "$env_file")"
  if [[ -z "$key" || "$key" == "replace_with_your_gemini_api_key" ]]; then
    echo "GOOGLE_API_KEY is missing in $env_file"
    echo "Replace the placeholder with your Gemini API key, then run this again."
    exit 1
  fi
}

ensure_backend_deps() {
  if [[ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]]; then
    echo "Setting up backend virtualenv..."
    (cd "$BACKEND_DIR" && python3 -m venv .venv)
    (cd "$BACKEND_DIR" && .venv/bin/pip install -r requirements.txt)
  fi
}

ensure_frontend_deps() {
  if [[ ! -x "$FRONTEND_DIR/node_modules/.bin/vite" ]]; then
    echo "Installing frontend packages..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

start_backend() {
  if health_ok; then
    echo "Live bridge already running at $BACKEND_URL"
    return
  fi

  if is_listening "$BACKEND_PORT"; then
    echo "Port $BACKEND_PORT is already in use, but $BACKEND_URL/health is not responding."
    echo "Free that port or set BACKEND_PORT=another_port."
    exit 1
  fi

  echo "Starting live bridge on $BACKEND_URL..."
  (
    cd "$BACKEND_DIR"
    set -a
    source .env
    set +a
    PYTHONPATH=app .venv/bin/uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
  )

  for _ in {1..20}; do
    if health_ok; then
      return
    fi
    sleep 0.5
  done

  echo "Live bridge failed to become healthy. Log:"
  tail -80 "$BACKEND_LOG"
  exit 1
}

start_frontend() {
  if frontend_ok; then
    echo "Frontend already running at $FRONTEND_URL"
    return
  fi

  if is_listening "$FRONTEND_PORT"; then
    echo "Port $FRONTEND_PORT is already in use, but $LIVE_TUTOR_URL is not responding."
    echo "Free that port or set FRONTEND_PORT=another_port."
    exit 1
  fi

  echo "Starting frontend on $FRONTEND_URL..."
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
  )

  for _ in {1..20}; do
    if frontend_ok; then
      return
    fi
    sleep 0.5
  done

  echo "Frontend failed to become ready. Log:"
  tail -80 "$FRONTEND_LOG"
  exit 1
}

case "${1:-start}" in
  start)
    ensure_backend_env
    ensure_backend_deps
    ensure_frontend_deps
    start_backend
    start_frontend
    echo
    echo "Live Tutor is running:"
    echo "$LIVE_TUTOR_URL"
    echo
    echo "Logs:"
    echo "  backend:  $BACKEND_LOG"
    echo "  frontend: $FRONTEND_LOG"
    ;;
  stop)
    stop_live_tutor
    ;;
  restart)
    stop_live_tutor
    "$0" start
    ;;
  *)
    echo "Usage: $0 [start|stop|restart]"
    exit 2
    ;;
esac
