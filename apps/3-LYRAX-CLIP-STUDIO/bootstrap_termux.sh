#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${LYRAX_REPO_URL:-https://github.com/HaadiTaba111/Main_Projects_conn.git}"
BRANCH="${LYRAX_BRANCH:-arena/578b8ae6-main-projects-conn}"
INSTALL_DIR="${LYRAX_INSTALL_DIR:-$HOME/Main_Projects_conn}"
APP_REL="apps/3-LYRAX-CLIP-STUDIO"

if command -v pkg >/dev/null 2>&1; then
    pkg update -y
    pkg install -y git python ffmpeg
    # Termux packages are preferred for native libraries such as NumPy/Pillow.
    pkg install -y python-numpy python-pillow || true
fi

if ! command -v git >/dev/null 2>&1; then
    echo "Git is required. In Termux run: pkg install -y git" >&2
    exit 1
fi
if ! command -v python >/dev/null 2>&1; then
    echo "Python is required. In Termux run: pkg install -y python" >&2
    exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "FFmpeg is required. In Termux run: pkg install -y ffmpeg" >&2
    exit 1
fi

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
if [[ ! -f "$APP_DIR/app.py" || ! -f "$APP_DIR/requirements.txt" || ! -f "$APP_DIR/requirements-termux.txt" ]]; then
    echo "Clip Studio files were not found in $APP_DIR." >&2
    echo "Check LYRAX_REPO_URL and LYRAX_BRANCH (the selected branch must contain this app)." >&2
    exit 1
fi

cd "$APP_DIR"
if [[ ! -x .venv/bin/python ]]; then
    python -m venv --system-site-packages .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-termux.txt

cat <<'EOF'

LyraX Clip Studio is starting.
On this phone open: http://127.0.0.1:5000
Keep this Termux session running; press Ctrl+C to stop the server.
EOF
exec .venv/bin/python app.py
