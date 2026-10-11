#!/data/data/com.termux/files/usr/bin/bash
# اجرای خودکار Lyrax Clip Studio (یا داشبورد) روی Termux.
#
#   bash termux_auto.sh            → نصب پیش‌نیازها، به‌روزرسانی، نصب وابستگی‌ها و اجرای Lyrax روی http://127.0.0.1:5000
#   bash termux_auto.sh dashboard  → همان کارها و اجرای داشبورد روی http://127.0.0.1:8700
#
# متغیرهای اختیاری: TERMUX_AUTO_REPO_DIR (مسیر ریپو)، LYRAX_HOST (پیش‌فرض 127.0.0.1)،
# LYRAX_PORT (پیش‌فرض 5000)، TERMUX_AUTO_NO_UPDATE=1 (بدون git pull)
set -euo pipefail

REPO_URL="${LYRAX_REPO_URL:-https://github.com/HaadiTaba111/Main_Projects_conn.git}"
BRANCH="arena/578b8ae6-main-projects-conn"
TARGET="${1:-lyrax}"
APP_REL="apps/3-LYRAX-CLIP-STUDIO"

log()  { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

# ۱) پیش‌نیازهای سیستمی (فقط روی Termux)
if command -v pkg >/dev/null 2>&1; then
    log "نصب/به‌روزرسانی پیش‌نیازهای Termux (git, nodejs, python, ffmpeg)"
    pkg update -y
    pkg install -y git nodejs python ffmpeg
    # بسته‌های بومی NumPy/Pillow از خود Termux؛ اگر نبودند مشکلی نیست، pip سعی می‌کند
    pkg install -y python-numpy python-pillow || true
else
    log "این اسکریپت برای Termux است؛ پیش‌نیازها را خودت نصب کن (git, python3, nodejs, ffmpeg)."
fi

for tool in git python3; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool پیدا نشد."
done
if [[ "$TARGET" == "dashboard" ]]; then
    command -v node >/dev/null 2>&1 || fail "Node.js پیدا نشد (pkg install nodejs)."
fi

# ۲) مکان ریپو: اگر این فایل داخل یک checkout است همان را استفاده کن، وگرنه کلون کن
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
else
    REPO_DIR="${TERMUX_AUTO_REPO_DIR:-$HOME/Main_Projects_conn}"
    if [[ ! -d "$REPO_DIR/.git" ]]; then
        [[ -e "$REPO_DIR" ]] && fail "$REPO_DIR وجود دارد ولی کلون Git نیست. TERMUX_AUTO_REPO_DIR را عوض کن."
        log "کلون شاخهٔ $BRANCH در $REPO_DIR"
        git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
    fi
fi

# ۳) به‌روزرسانی امن: فقط fast-forward؛ اگر تغییرات محلی باشد، کد محلی را خراب نمی‌کند
if [[ "${TERMUX_AUTO_NO_UPDATE:-0}" != "1" ]]; then
    log "به‌روزرسانی شاخه $BRANCH"
    if git -C "$REPO_DIR" fetch --quiet origin "$BRANCH" && \
       git -C "$REPO_DIR" checkout -q "$BRANCH" 2>/dev/null && \
       git -C "$REPO_DIR" pull --ff-only --quiet origin "$BRANCH"; then
        echo "کد به‌روز است."
    else
        echo "⚠️ به‌روزرسانی انجام نشد (تغییرات محلی یا شاخهٔ دیگر). با کد فعلی ادامه می‌دهم."
    fi
fi

if [[ "$TARGET" == "dashboard" ]]; then
    log "اجرای داشبورد"
    cd "$REPO_DIR/dashboard"
    export HOST="${HOST:-127.0.0.1}"
    echo "داشبورد: http://127.0.0.1:${DASHBOARD_PORT:-8700}"
    exec node server.js
fi

# ۴) Lyrax: venv، وابستگی‌ها، بررسی import و اجرا
APP_DIR="$REPO_DIR/$APP_REL"
[[ -f "$APP_DIR/app.py" ]] || fail "فایل app.py در $APP_DIR پیدا نشد."
cd "$APP_DIR"

if [[ ! -x .venv/bin/python ]]; then
    log "ساخت محیط مجازی Python (.venv)"
    python3 -m venv --system-site-packages .venv
fi

log "نصب وابستگی‌های Lyrax (requirements-termux.txt)"
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements-termux.txt

log "بررسی وابستگی‌ها"
if ! .venv/bin/python -c "import flask, numpy, PIL, arabic_reshaper, bidi.algorithm" 2>/tmp/termux_auto_import.log; then
    cat /tmp/termux_auto_import.log >&2
    fail "یکی از وابستگی‌ها import نشد. خروجی بالا را بفرست."
fi
command -v ffmpeg >/dev/null 2>&1 || echo "⚠️ ffmpeg پیدا نشد؛ رندر کار نمی‌کند (pkg install ffmpeg)."

export CLIP_STUDIO_HOST="${LYRAX_HOST:-127.0.0.1}"
export CLIP_STUDIO_PORT="${LYRAX_PORT:-5000}"
cat <<EOF

LyraX Clip Studio در حال اجراست.
  در مرورگر گوشی باز کن: http://127.0.0.1:${CLIP_STUDIO_PORT}
  برای توقف: Ctrl+C
  (این برنامه فقط روی همین گوشی در دسترس است؛ برای دسترسی از شبکه: LYRAX_HOST=0.0.0.0)
EOF
exec .venv/bin/python app.py
