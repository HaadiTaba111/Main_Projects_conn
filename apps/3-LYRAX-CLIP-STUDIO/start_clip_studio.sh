#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
if [[ -x .venv/bin/python ]]; then
    PYTHON=.venv/bin/python
else
    PYTHON=python3
fi
echo "🎬 در حال اجرای LyraX Clip Studio روی http://127.0.0.1:5000 ..."
exec "$PYTHON" app.py
