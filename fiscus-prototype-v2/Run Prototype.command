#!/bin/bash
# Double-click this file to view the Credit Assessment prototype in your browser.
# No install required — it serves the pre-built app/dist folder with Python's
# built-in web server (macOS ships with Python 3) and opens your browser to it.

cd "$(dirname "$0")"
PORT=5183

if [ ! -d "dist" ]; then
  echo "dist/ not found — building first (requires Node/npm)..."
  npm install && npm run build
fi

echo "Starting Credit Assessment prototype at http://localhost:$PORT"
echo "Close this window (or press Ctrl+C) to stop the server."
( sleep 1 && open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT" --directory dist
