#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  run_poet_continual.sh — اجرای زنجیرهٔ کامل آموزش پیوستهٔ مغز شاعر
#
#  گام‌ها:
#    ۱. تقطیر دیتاست شاعر به فایل‌های تسک (continual/data/*.jsonl)
#    ۲. خودآزمایی ماژول آموزش (بدون نیاز به GPU)
#    ۳. آموزش ترتیبی + ساخت ماتریس R  (نیاز به torch/transformers/peft)
#    ۴. گزارش سنجه‌های ACC/BWT/Forgetting با continual_eval.py
#
#  اجرا (از ریشهٔ برنامه):  bash continual/run_poet_continual.sh
#         bash continual/run_poet_continual.sh --prepare-only
#         bash continual/run_poet_continual.sh --eval-only
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || exit 1

PYTHON="${PYTHON:-python3}"
if [ -x "$APP_DIR/.venv/bin/python" ]; then PYTHON="$APP_DIR/.venv/bin/python"; fi

MODE="all"
case "${1:-}" in
  --prepare-only) MODE="prepare" ;;
  --eval-only)    MODE="eval" ;;
  --train-only)   MODE="train" ;;
  --help|-h)
    sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
esac

echo "🧠 مغز شاعر — آموزش پیوسته (Continual SFT + DSA seam)"
echo "   برنامه: $APP_DIR"
echo "   پایتون: $($PYTHON -V 2>&1)"
echo "───────────────────────────────────────────────────────────────────────"

if [ "$MODE" = "all" ] || [ "$MODE" = "prepare" ]; then
  echo "📚 گام ۱: تقطیر دیتاست به تسک‌ها"
  "$PYTHON" continual/prepare_poet_tasks.py || { echo "❌ آماده‌سازی شکست خورد"; exit 1; }
  echo
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "train" ]; then
  echo "🧪 گام ۲: خودآزمایی ماژول‌ها"
  "$PYTHON" continual/poet_continual_sft.py --selftest || exit 1
  "$PYTHON" continual/continual_eval.py --selftest >/dev/null && echo "   ✅ continual_eval selftest OK"
  echo

  echo "🚀 گام ۳: آموزش ترتیبی تسک‌ها (QLoRA)"
  if ! "$PYTHON" -c "import torch, transformers, peft" 2>/dev/null; then
    echo "⚠️  وابستگی‌های آموزش نصب نیستند (torch / transformers / peft / bitsandbytes)."
    echo "   روی Termux آموزش مدل توصیه نمی‌شود؛ این گام را روی PC با GPU اجرا کن:"
    echo "     pip install -r requirements-train.txt"
    echo "   آماده‌سازی و سنجه‌ها بدون این بسته‌ها هم کار می‌کنند."
    echo
  else
    "$PYTHON" continual/poet_continual_sft.py --config continual/config.poet.json || exit 1
    echo
  fi
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "eval" ]; then
  echo "📊 گام ۴: سنجه‌های یادگیری پیوسته"
  if [ -f continual/results.json ]; then
    "$PYTHON" continual/continual_eval.py continual/results.json
  else
    echo "ℹ️  continual/results.json هنوز ساخته نشده (گام آموزش اجرا نشده است)."
    echo "   برای دیدن نمونهٔ خروجی:  $PYTHON continual/continual_eval.py --selftest"
  fi
fi

echo
echo "✅ پایان. خروجی‌ها: continual/results.json و continual/out/"
