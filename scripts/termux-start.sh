#!/bin/bash
set -euo pipefail

BRANCH=$(git branch --show-current)
POLL_INTERVAL=3

echo "Installing/updating dependencies..."
npm install --silent

echo "Starting Vite at http://localhost:3000 ..."
npm run dev &
VITE_PID=$!

cleanup() {
  kill "$VITE_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "Watching origin/$BRANCH for new commits every ${POLL_INTERVAL}s..."

while true; do
  sleep "$POLL_INTERVAL"
  git fetch origin "$BRANCH" --quiet 2>/dev/null || true
  LOCAL=$(git rev-parse HEAD 2>/dev/null)
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null) || true
  if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
    echo "New commits — pulling..."
    git pull origin "$BRANCH" --rebase --quiet
  fi
done
