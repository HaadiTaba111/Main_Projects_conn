#!/data/data/com.termux/files/usr/bin/bash
# منوی سبک اجرای دو برنامهٔ بازار روی Termux.
set -u

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="arena/01a10c56-main-arena-conn"
clear 2>/dev/null || true

echo "============================================================"
echo "  اتوتریدر و رادار پامپ — Termux"
echo "============================================================"
echo "  [1] اتوتریدر فیوچرز       http://localhost:8787"
echo "  [2] رادار پامپ/دامپ       http://localhost:8790"
echo "  [3] دریافت به‌روزرسانی‌های شاخهٔ $BRANCH"
echo "  [0] خروج"
echo "============================================================"
read -r -p "انتخاب: " choice

case "$choice" in
  1) exec bash "$ROOT_DIR/1-AUTOTRADE.sh" ;;
  2) exec bash "$ROOT_DIR/2-PUMP-RADAR.sh" ;;
  3)
    if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "❌ این پوشه کلون Git نیست: $ROOT_DIR"
      exit 1
    fi
    git -C "$ROOT_DIR" pull --ff-only origin "$BRANCH"
    ;;
  0) echo "خروج." ;;
  *) echo "گزینه نامعتبر است."; exit 2 ;;
esac
