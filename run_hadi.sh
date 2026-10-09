#!/usr/bin/env bash
# منوی اجرای پروژه‌های هادی روی Linux و Termux.
set -u

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="arena/01a10c56-main-arena-conn"

clear 2>/dev/null || true
echo "============================================================"
echo "  سامانهٔ اجرای پروژه‌ها — TaHa111"
echo "============================================================"
echo "  [1] اتوتریدر فیوچرز PWA  (پورت 8787)"
echo "  [2] رادار پامپ/دامپ       (پورت 8790)"
echo "  [3] استودیو LyraX          (پورت 5000، نیازمند Python)"
echo "  [4] مغز شاعر فارسی         (نیازمند Python)"
echo "  [5] آزمون DSA              (نیازمند Python)"
echo "  [6] دریافت تغییرات شاخهٔ $BRANCH"
echo "  [0] خروج"
echo "============================================================"
read -r -p "انتخاب: " choice

case "$choice" in
  1) exec bash "$ROOT_DIR/1-AUTOTRADE.sh" ;;
  2) exec bash "$ROOT_DIR/2-PUMP-RADAR.sh" ;;
  3) exec python3 "$ROOT_DIR/apps/3-LYRAX-CLIP-STUDIO/app.py" ;;
  4) exec python3 "$ROOT_DIR/apps/4-PERSIAN-POET-BRAIN/persian_living_brain.py" ;;
  5) exec python3 "$ROOT_DIR/dsa-security/dsa_sharif_evaluator_kit.py" ;;
  6) git -C "$ROOT_DIR" pull --ff-only origin "$BRANCH" ;;
  0) echo "خروج." ;;
  *) echo "گزینه نامعتبر است."; exit 2 ;;
esac
