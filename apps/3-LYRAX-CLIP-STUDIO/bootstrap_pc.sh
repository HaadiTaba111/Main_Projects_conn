#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${LYRAX_REPO_URL:-https://github.com/HaadiTaba111/Main_Projects_conn.git}"
BRANCH="${LYRAX_BRANCH:-arena/578b8ae6-main-projects-conn}"
INSTALL_DIR="${LYRAX_INSTALL_DIR:-$HOME/Main_Projects_conn}"
APP_REL="apps/3-LYRAX-CLIP-STUDIO"

for command_name in git python3; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing prerequisite: $command_name. Install Git and Python 3, then retry." >&2
        exit 1
    fi
done

if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "Using existing checkout: $INSTALL_DIR (local changes are not overwritten)."
elif [[ -e "$INSTALL_DIR" ]]; then
    echo "Refusing to overwrite $INSTALL_DIR because it is not a Git checkout." >&2
    echo "Set LYRAX_INSTALL_DIR to a new empty path and retry." >&2
    exit 1
else
    git clone --depth 1 --single-branch --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

APP_DIR="$INSTALL_DIR/$APP_REL"
if [[ ! -f "$APP_DIR/app.py" || ! -f "$APP_DIR/requirements.txt" ]]; then
    echo "Clip Studio files were not found in $APP_DIR." >&2
    echo "Check LYRAX_REPO_URL and LYRAX_BRANCH (the selected branch must contain this app)." >&2
    exit 1
fi

cd "$APP_DIR"
if [[ ! -x .venv/bin/python ]]; then
    python3 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

cat <<'EOF'

LyraX Clip Studio is starting.
Open http://127.0.0.1:5000 in your browser.
Keep this terminal open; press Ctrl+C to stop the server.
EOF
exec .venv/bin/python app.py
