#!/bin/sh
# Double-click to open the dashboard at http://localhost:8765. Close this window to stop it.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8765") &
exec python3 -m http.server 8765
