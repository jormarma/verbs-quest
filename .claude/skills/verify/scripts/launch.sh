#!/usr/bin/env bash
# Starts an isolated verbs-quest stack for verification: SpacetimeDB, Vite and headless Chrome on free ports.
# Usage: .claude/skills/verify/scripts/launch.sh
set -eo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"
SCRIPTS_DIR="$SKILL_DIR/scripts"
EVIDENCE_ROOT="$REPO/verify-evidence"
SCRATCH_BASE="/tmp/verbs-quest-verify"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DB_NAME="verbs-quest-verify"
DETACH=(perl -MPOSIX -e 'POSIX::setsid() or die "setsid: $!"; exec @ARGV or die "exec: $!"')

RUN_ID=""

fail() {
  echo "launch: $*" >&2
  exit 1
}

on_exit() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -n "$RUN_ID" ]; then
    echo "launch: failed with status $status; stopping the processes of run $RUN_ID" >&2
    "$SCRIPTS_DIR/cleanup.sh" "$RUN_ID" >&2 || true
  fi
  exit "$status"
}
trap on_exit EXIT

for tool in spacetime node nc lsof pgrep ps perl; do
  command -v "$tool" >/dev/null 2>&1 || fail "missing tool on PATH: $tool"
done
[ -x "$CHROME_BIN" ] || fail "Chrome not found at $CHROME_BIN"
[ -f "$REPO/node_modules/vite/bin/vite.js" ] || fail "repo dependencies missing; run pnpm install in $REPO"

login_output="$(spacetime login show --token 2>/dev/null || true)"
case "$login_output" in
  *"auth token"*) ;;
  *) fail "no SpacetimeDB CLI login; run spacetime login" ;;
esac

if [ ! -d "$SCRIPTS_DIR/node_modules/playwright-core" ]; then
  (cd "$SCRIPTS_DIR" && npm ci --no-audit --no-fund)
fi

if [ -f "$EVIDENCE_ROOT/current/run.env" ]; then
  live_run="$(
    set -a
    . "$EVIDENCE_ROOT/current/run.env"
    set +a
    for pid in "${STDB_PID:-}" "${VITE_PID:-}" "${CHROME_PID:-}"; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        echo "$RUN_ID"
        break
      fi
    done
  )"
  [ -z "$live_run" ] || fail "run $live_run is still live; stop it first with .claude/skills/verify/scripts/cleanup.sh"
fi

pick_port() {
  local port
  for ((port = $1; port <= $2; port++)); do
    if ! nc -z 127.0.0.1 "$port" 2>/dev/null; then
      echo "$port"
      return 0
    fi
  done
  return 1
}
STDB_PORT="$(pick_port 3100 3199)" || fail "no free SpacetimeDB port in 3100-3199"
VITE_PORT="$(pick_port 5187 5199)" || fail "no free Vite port in 5187-5199"
CDP_PORT="$(pick_port 9340 9349)" || fail "no free Chrome DevTools port in 9340-9349"

RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUN_DIR="$EVIDENCE_ROOT/$RUN_ID"
SCRATCH_DIR="$SCRATCH_BASE/$RUN_ID"
STDB_URL="http://127.0.0.1:$STDB_PORT"
APP_URL="http://127.0.0.1:$VITE_PORT/"
CDP_URL="http://127.0.0.1:$CDP_PORT"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_HEAD="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)"
STDB_PID=""
VITE_PID=""
CHROME_PID=""

mkdir -p "$RUN_DIR/logs" "$RUN_DIR/screens" "$RUN_DIR/flows" "$SCRATCH_DIR/stdb-data" "$SCRATCH_DIR/chrome-profile"

write_run_env() {
  cat >"$RUN_DIR/run.env" <<EOF
RUN_ID=$RUN_ID
REPO_DIR=$REPO
RUN_DIR=$RUN_DIR
SCRATCH_DIR=$SCRATCH_DIR
DB_NAME=$DB_NAME
STDB_PORT=$STDB_PORT
STDB_URL=$STDB_URL
STDB_PID=$STDB_PID
VITE_PORT=$VITE_PORT
APP_URL=$APP_URL
VITE_PID=$VITE_PID
CDP_PORT=$CDP_PORT
CDP_URL=$CDP_URL
CHROME_PID=$CHROME_PID
GIT_HEAD=$GIT_HEAD
STARTED_AT=$STARTED_AT
EOF
  ln -sfn "$RUN_ID" "$EVIDENCE_ROOT/current"
}

listener_pid() {
  { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; } | head -n 1
}

wait_for_port() {
  local tries=0
  while ! nc -z 127.0.0.1 "$1" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -lt 120 ] || return 1
    sleep 0.5
  done
}

wait_for_stdb() {
  local tries=0 out
  while [ "$tries" -lt 120 ]; do
    out="$(spacetime server ping "$STDB_URL" 2>/dev/null || true)"
    case "$out" in
      *"Server is online"*) return 0 ;;
    esac
    tries=$((tries + 1))
    sleep 0.5
  done
  return 1
}

write_run_env
cd "$REPO"

"${DETACH[@]}" spacetime start --listen-addr "127.0.0.1:$STDB_PORT" --data-dir "$SCRATCH_DIR/stdb-data" --in-memory --non-interactive \
  >"$RUN_DIR/logs/stdb.log" 2>&1 </dev/null &
wait_for_stdb || fail "SpacetimeDB did not answer on $STDB_URL; see $RUN_DIR/logs/stdb.log"
STDB_PID="$(listener_pid "$STDB_PORT")"
write_run_env

spacetime publish --server "$STDB_URL" --module-path "$REPO/spacetimedb" --delete-data=always --yes "$DB_NAME" \
  >"$RUN_DIR/logs/publish.log" 2>&1 || fail "publish failed; see $RUN_DIR/logs/publish.log"

node "$REPO/scripts/import-verbs-csv.mjs" --execute --db "$DB_NAME" --server "$STDB_URL" \
  >"$RUN_DIR/logs/import.log" 2>&1 || fail "verb import failed; see $RUN_DIR/logs/import.log"

VITE_SPACETIMEDB_URI="ws://127.0.0.1:$STDB_PORT" VITE_SPACETIMEDB_DB="$DB_NAME" \
  "${DETACH[@]}" node "$REPO/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port "$VITE_PORT" --strictPort \
  >"$RUN_DIR/logs/vite.log" 2>&1 </dev/null &
wait_for_port "$VITE_PORT" || fail "Vite did not open $VITE_PORT; see $RUN_DIR/logs/vite.log"
VITE_PID="$(listener_pid "$VITE_PORT")"
write_run_env

"${DETACH[@]}" "$CHROME_BIN" --headless=new --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$SCRATCH_DIR/chrome-profile" --no-first-run --no-default-browser-check \
  --window-size=1280,900 --remote-allow-origins='*' about:blank \
  >"$RUN_DIR/logs/chrome.log" 2>&1 </dev/null &
wait_for_port "$CDP_PORT" || fail "Chrome did not open DevTools port $CDP_PORT; see $RUN_DIR/logs/chrome.log"
CHROME_PID="$(listener_pid "$CDP_PORT")"
write_run_env

trap - EXIT
echo "launched run $RUN_ID"
echo "  SpacetimeDB  $STDB_URL  (pid $STDB_PID, database $DB_NAME)"
echo "  app          $APP_URL  (pid $VITE_PID)"
echo "  chrome CDP   $CDP_URL  (pid $CHROME_PID)"
echo "  evidence     $RUN_DIR"
echo "next: node .claude/skills/verify/scripts/doctor.mjs"
