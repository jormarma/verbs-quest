#!/usr/bin/env bash
# Stops the processes a verification run started and deletes its scratch state.
# The run's evidence folder under verify-evidence/ is kept.
# Usage: .claude/skills/verify/scripts/cleanup.sh [run-id]     (default: current)
set -o pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"
RUN_ID="${1:-current}"
ENV_FILE="$REPO/verify-evidence/$RUN_ID/run.env"

[ -f "$ENV_FILE" ] || {
  echo "cleanup: no run recorded at $ENV_FILE" >&2
  exit 1
}
set -a
. "$ENV_FILE"
set +a

case "$SCRATCH_DIR" in
  /tmp/verbs-quest-verify/*) ;;
  *)
    echo "cleanup: refusing to act on unexpected scratch path '$SCRATCH_DIR'" >&2
    exit 1
    ;;
esac

owned() {
  local command
  command="$(ps -o command= -p "$1" 2>/dev/null || true)"
  case "$command" in
    *"$2"*) return 0 ;;
  esac
  return 1
}

listeners_owned_by() {
  local pid
  for pid in $({ lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; } | sort -u); do
    if owned "$pid" "$2"; then echo "$pid"; fi
  done
  return 0
}

STOP_LIST=""
add_pid() {
  [ -n "$1" ] || return 0
  case " $STOP_LIST " in
    *" $1 "*) return 0 ;;
  esac
  STOP_LIST="$STOP_LIST $1"
}

if [ -n "${STDB_PID:-}" ] && owned "$STDB_PID" "$SCRATCH_DIR"; then add_pid "$STDB_PID"; fi
if [ -n "${CHROME_PID:-}" ] && owned "$CHROME_PID" "$SCRATCH_DIR"; then add_pid "$CHROME_PID"; fi
if [ -n "${VITE_PID:-}" ] && owned "$VITE_PID" "--port $VITE_PORT"; then add_pid "$VITE_PID"; fi
for pid in $(listeners_owned_by "$STDB_PORT" "$SCRATCH_DIR") $(listeners_owned_by "$CDP_PORT" "$SCRATCH_DIR"); do
  add_pid "$pid"
done
for pid in $(listeners_owned_by "$VITE_PORT" "--port $VITE_PORT"); do add_pid "$pid"; done
for pid in $(pgrep -f "$SCRATCH_DIR" 2>/dev/null || true); do add_pid "$pid"; done

for pid in $STOP_LIST; do
  kill -TERM "$pid" 2>/dev/null || true
done
for _ in $(seq 1 20); do
  [ -z "$(pgrep -f "$SCRATCH_DIR" 2>/dev/null)" ] && break
  sleep 0.5
done
for pid in $(pgrep -f "$SCRATCH_DIR" 2>/dev/null || true); do
  kill -KILL "$pid" 2>/dev/null || true
done
for pid in $STOP_LIST; do
  if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
done

rm -rf "$SCRATCH_DIR"
printf 'CLEANED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$ENV_FILE"

status=0
for port in "$STDB_PORT" "$VITE_PORT" "$CDP_PORT"; do
  [ -n "$port" ] || continue
  if nc -z 127.0.0.1 "$port" 2>/dev/null; then
    echo "cleanup: port $port is still open" >&2
    status=1
  else
    echo "stopped: port $port is closed"
  fi
done

leftover="$(pgrep -f "$SCRATCH_DIR" 2>/dev/null || true)"
if [ -n "$leftover" ]; then
  echo "cleanup: processes still running from $SCRATCH_DIR: $leftover" >&2
  status=1
fi

echo "removed scratch state: $SCRATCH_DIR"
echo "evidence kept: $RUN_DIR"
exit "$status"
