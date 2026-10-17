#!/usr/bin/env bash
# run_all.sh — کلون/به‌روزرسانی ریپو، نصب پیش‌نیازها، اجرای تست‌ها و بالا آوردن داشبورد همه‌ی سیستم‌ها.
# Termux (اندروید) و Linux/WSL2 (Ubuntu) را خودش تشخیص می‌دهد.
#
# استفاده:
#   bash run_all.sh                 # کلون/آپدیت + نصب + تست + داشبورد روی http://127.0.0.1:8700
#   bash run_all.sh --no-test       # بدون اجرای تست‌ها
#   bash run_all.sh --no-install    # بدون نصب پیش‌نیازها (فقط کلون/آپدیت و اجرا)
#   bash run_all.sh --test-only     # فقط تست‌ها، بدون داشبورد
#
# متغیرهای اختیاری: REPO_DIR (مسیر ریپو، پیش‌فرض ~/Main_Projects_conn)، BRANCH، HOST (پیش‌فرض 127.0.0.1)
# مسیر ریپو را روی /mnt/c (ویندوز) نگذار؛ در WSL2 داخل ~/ کلون کن تا سریع و بی‌مشکل باشد.

set -u

REPO_URL="${REPO_URL:-https://github.com/HaadiTaba111/Main_Projects_conn.git}"
BRANCH="${BRANCH:-arena/578b8ae6-main-projects-conn}"
DEFAULT_DIR="${REPO_DIR:-$HOME/Main_Projects_conn}"
export HOST="${HOST:-127.0.0.1}"

RUN_TESTS=1
INSTALL=1
DASHBOARD=1
for arg in "$@"; do
  case "$arg" in
    --no-test) RUN_TESTS=0 ;;
    --no-install) INSTALL=0 ;;
    --test-only) DASHBOARD=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "گزینه‌ی ناشناخته: $arg"; exit 2 ;;
  esac
done

say()  { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
ok()   { printf '✅ %s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*"; }
die()  { printf '❌ %s\n' "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------- ۱. تشخیص محیط ----------
if [ -n "${PREFIX:-}" ] && [ -d "${PREFIX}/bin" ] && have pkg; then
  ENVIRON=termux
else
  ENVIRON=linux
fi
say "محیط: $ENVIRON"

# ---------- ۲. پیش‌نیازهای سیستمی ----------
install_prereqs() {
  local missing=()
  for c in git node python3 ffmpeg; do have "$c" || missing+=("$c"); done
  if [ ${#missing[@]} -eq 0 ]; then
    ok "git، node، python3 و ffmpeg نصب هستند"
  elif [ "$ENVIRON" = termux ]; then
    say "نصب پیش‌نیازها با pkg (${missing[*]})"
    pkg update -y || warn "pkg update خطا داد؛ ادامه می‌دهم"
    pkg install -y git nodejs python ffmpeg || warn "بعضی پکیج‌ها نصب نشدند"
  elif have apt-get; then
    local sudo_cmd=""
    [ "$(id -u)" -ne 0 ] && sudo_cmd="sudo"
    say "نصب پیش‌نیازها با apt (${missing[*]})"
    $sudo_cmd apt-get update -y || warn "apt update خطا داد"
    $sudo_cmd apt-get install -y git nodejs npm python3 python3-venv python3-pip ffmpeg || warn "بعضی پکیج‌ها نصب نشدند"
  else
    warn "apt-get پیدا نشد. این‌ها را خودت نصب کن: ${missing[*]}"
  fi
  if have node; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')"
    [ "$major" -ge 18 ] 2>/dev/null && ok "Node $major" || warn "Node باید ۱۸+ باشد (الان: $major)"
  fi
  have ffmpeg || warn "ffmpeg نیست؛ رندر ویدیوی Lyrax کار نمی‌کند"
}
[ "$INSTALL" -eq 1 ] && install_prereqs
have git || die "git نصب نیست؛ نمی‌توانم ادامه بدهم"
have node || die "node نصب نیست؛ نمی‌توانم ادامه بدهم"

# ---------- ۳. ریپو: کلون یا به‌روزرسانی ----------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT=""
if git -C "$SCRIPT_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
  say "از ریپوی موجود استفاده می‌شود: $ROOT"
else
  ROOT="$DEFAULT_DIR"
  if [ ! -d "$ROOT/.git" ]; then
    say "کلون ریپو در $ROOT (شاخه: $BRANCH)"
    git clone --branch "$BRANCH" "$REPO_URL" "$ROOT" || die "کلون ناموفق بود (اینترنت یا دسترسی GitHub را چک کن)"
  fi
fi

say "به‌روزرسانی شاخه $BRANCH"
git -C "$ROOT" fetch -q origin || warn "fetch ناموفق؛ با نسخه‌ی محلی ادامه می‌دهم"
CUR_BRANCH="$(git -C "$ROOT" branch --show-current)"
DIRTY="$(git -C "$ROOT" status --porcelain --untracked-files=no)"
if [ "$CUR_BRANCH" != "$BRANCH" ]; then
  if [ -z "$DIRTY" ]; then
    git -C "$ROOT" checkout -q "$BRANCH" 2>/dev/null \
      || git -C "$ROOT" checkout -q -b "$BRANCH" "origin/$BRANCH" \
      || warn "نتوانستم به $BRANCH بروم (الان: $CUR_BRANCH)"
  else
    warn "تغییرات محلی داری؛ روی $CUR_BRANCH می‌مونم (برای شاخه‌ی درست: git stash ثم دوباره اجرا کن)"
  fi
fi
if [ -z "$DIRTY" ] && [ "$(git -C "$ROOT" branch --show-current)" = "$BRANCH" ]; then
  git -C "$ROOT" pull -q --ff-only origin "$BRANCH" || warn "pull ff-only ناموفق؛ نسخه‌ی فعلی اجرا می‌شود"
else
  warn "به‌روزرسانی انجام نشد (تغییر محلی یا شاخه‌ی دیگر). داده‌ی تو حذف نشد."
fi
ok "commit فعلی: $(git -C "$ROOT" rev-parse --short HEAD) — شاخه: $(git -C "$ROOT" branch --show-current)"

# ---------- ۴. نصب وابستگی‌های Lyrax (Python) ----------
LY="$ROOT/apps/3-LYRAX-CLIP-STUDIO"
if [ "$INSTALL" -eq 1 ]; then
  say "نصب Lyrax (venv + requirements)"
  if [ ! -x "$LY/.venv/bin/python" ]; then
    python3 -m venv "$LY/.venv" || die "ساخت venv ناموفق (روی Ubuntu: sudo apt install python3-venv)"
  fi
  REQ="requirements.txt"
  [ "$ENVIRON" = termux ] && REQ="requirements-termux.txt"
  "$LY/.venv/bin/python" -m pip install -q --upgrade pip >/dev/null 2>&1 || true
  "$LY/.venv/bin/python" -m pip install -q -r "$LY/$REQ" || warn "نصب requirements ناموفق بود؛ لاگ pip را ببین"
fi

# ---------- ۵. تست‌ها ----------
LOGDIR="$HOME/.arena-run-logs"
mkdir -p "$LOGDIR"
PASS=0; FAIL=0
run_test() {
  local name="$1"; shift
  local log="$LOGDIR/$(echo "$name" | tr ' /' '__').log"
  if "$@" >"$log" 2>&1; then
    ok "تست $name: پاس"; PASS=$((PASS+1))
  else
    warn "تست $name: ناموفق — لاگ: $log"; FAIL=$((FAIL+1))
  fi
}
if [ "$RUN_TESTS" -eq 1 ]; then
  say "اجرای تست‌ها"
  run_test "اتوتریدر" bash -c "cd '$ROOT/apps/1-AUTOTRADE-FUTURES-PWA' && npm test"
  run_test "رادار پامپ/دامپ" bash -c "cd '$ROOT/apps/2-PUMP-DUMP-RADAR' && npm test"
  if [ -x "$LY/.venv/bin/python" ]; then
    run_test "Lyrax" bash -c "cd '$LY' && '$LY/.venv/bin/python' -m unittest discover -s tests"
  else
    warn "تست Lyrax رد شد: venv نیست (بدون --no-install اجرا کن)"; FAIL=$((FAIL+1))
  fi
  echo "نتیجه: $PASS پاس، $FAIL ناموفق"
fi

if [ "$DASHBOARD" -eq 0 ]; then
  say "پایان (فقط تست)"
  exit $(( FAIL > 0 ? 1 : 0 ))
fi

# ---------- ۶. داشبورد ----------
say "داشبورد همه‌ی سیستم‌ها"
if [ "$ENVIRON" = termux ]; then
  echo "نکته‌ی Termux: برای این‌که با خاموش شدن صفحه قطع نشود: termux-wake-lock"
fi
echo "👉 داشبورد:       http://127.0.0.1:8700"
echo "👉 اتوتریدر:     http://127.0.0.1:8787  (با کلید 1 در داشبورد روشن می‌شود)"
echo "👉 رادار:        http://127.0.0.1:8790  (کلید 2)"
echo "👉 Lyrax:        http://127.0.0.1:5000  (کلید 3)"
echo "برای توقف: Ctrl+C"
cd "$ROOT" && exec bash "$ROOT/dashboard.sh"
