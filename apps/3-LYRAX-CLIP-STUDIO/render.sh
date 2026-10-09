#!/usr/bin/env bash
# Run the exact backend FFmpeg renderer for an extracted/saved project directory.
# Usage: ./render.sh projects/<project-folder>
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ARG="${1:-}"
if [[ -z "$PROJECT_ARG" ]]; then
    echo "خطا: مسیر پوشه پروژه را وارد کنید."
    echo "مثال: ./render.sh projects/my_song"
    exit 1
fi

if [[ -d "$PROJECT_ARG" ]]; then
    PROJ_DIR="$(cd -- "$PROJECT_ARG" && pwd)"
elif [[ -d "$APP_DIR/$PROJECT_ARG" ]]; then
    PROJ_DIR="$(cd -- "$APP_DIR/$PROJECT_ARG" && pwd)"
else
    echo "خطا: پوشه پروژه در مسیر $PROJECT_ARG یافت نشد."
    exit 1
fi
if [[ ! -f "$PROJ_DIR/project.json" ]]; then
    echo "خطا: project.json در پوشه $PROJ_DIR یافت نشد."
    exit 1
fi

if [[ -x "$APP_DIR/.venv/bin/python" ]]; then
    PYTHON="$APP_DIR/.venv/bin/python"
else
    PYTHON="python3"
fi
export PYTHONPATH="$APP_DIR${PYTHONPATH:+:$PYTHONPATH}"
export CLIP_STUDIO_PROJECT_DIR="$PROJ_DIR"

echo "=================================================="
echo "🎬 رندر FFmpeg پروژه: $PROJ_DIR"
echo "=================================================="
"$PYTHON" - <<'PY'
import json
import os
from backend.models import Project
from backend.renderers import FFmpegRenderer

project_dir = os.environ["CLIP_STUDIO_PROJECT_DIR"]
project_json = os.path.join(project_dir, "project.json")
with open(project_json, "r", encoding="utf-8") as handle:
    project = Project.from_dict(json.load(handle))
output_path = os.path.join(project_dir, f"{project.name}_standalone.mp4")

def progress(percent, message):
    print(f"[{percent}%] {message}", flush=True)

FFmpegRenderer(project, project_dir, output_path, progress).render()
print(f"\n✅ خروجی ذخیره شد: {output_path}")
PY
