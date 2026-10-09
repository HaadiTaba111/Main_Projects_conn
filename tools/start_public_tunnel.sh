#!/bin/bash
# ==============================================================================
# 🌐 ایجاد لینک عمومی اینترنتی پایدار برای اندروید و ترموکس (بدون SSH و بدون پسورد)
# ==============================================================================

PORT=${1:-8787}

echo "===================================================================="
echo "   🚀 ساخت لینک اینترنتی رایگان جهانی Cloudflare برای پورت $PORT"
echo "   (۱۰۰٪ بدون پسورد، بدون SSH و بدون نیاز به کلید کاربری)"
echo "===================================================================="
echo ""

# ۱. راه‌اندازی با Cloudflare Tunnel (سریع‌ترین و پایدارترین روش در دنیا)
if ! command -v cloudflared &> /dev/null; then
    echo "📦 در حال نصب سریع Cloudflare Tunnel در ترموکس..."
    pkg install -y cloudflared &> /dev/null
    
    # اگر در مخزن پکیج نبود، دانلود مستقیم باینری سبک ARM64
    if ! command -v cloudflared &> /dev/null; then
        echo "⬇️ در حال دریافت نسخه مستقیم کلودفلر..."
        BIN_DIR="${PREFIX:-/data/data/com.termux/files/usr}/bin"
        mkdir -p "$BIN_DIR"
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o "$BIN_DIR/cloudflared" 2>/dev/null
        chmod +x "$BIN_DIR/cloudflared" 2>/dev/null
    fi
fi

if command -v cloudflared &> /dev/null; then
    echo "🌐 در حال اتصال به شبکه جهانی Cloudflare..."
    echo "💡 آدرس اینترنتی شما (https://*.trycloudflare.com) تا چند ثانیه دیگر در کادر زیر ظاهر می‌شود:"
    echo "--------------------------------------------------------------------"
    cloudflared tunnel --url http://localhost:$PORT
    exit 0
fi

# ۲. فال‌بک دوم با Serveo (بدون نیاز به نام کاربری یا پسورد)
echo "🌐 در حال ساخت لینک با سرور Serveo..."
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:$PORT serveo.net
