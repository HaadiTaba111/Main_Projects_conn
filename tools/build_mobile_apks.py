#!/usr/bin/env python3
"""
SkyGround Mobile & APK Helper Tool
---------------------------------
Helps build, package, and connect Android apps (Crypto Scalp Lab & LyraX Clip Studio)
with local WSL2 / Windows PC services.
"""

import os
import sys
import socket
import json
import subprocess

def get_local_ip_addresses():
    ips = []
    try:
        # Connect to an external address to get default route IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        ips.append(local_ip)
    except Exception:
        pass

    # PdaNet standard IP
    pdanet_ip = "10.1.19.2"
    if pdanet_ip not in ips:
        ips.append(pdanet_ip)

    return ips

def check_service_status(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1.0)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()
    return result == 0

def generate_mobile_summary():
    ips = get_local_ip_addresses()
    crypto_running = check_service_status(8787)
    lyrax_running = check_service_status(5000)

    print("=" * 65)
    print("  🚀 SKGROUND MOBILE & APK SUITE — وضعیت اتصال موبایل و اندروید")
    print("=" * 65)
    print(f"📡 آی‌پی‌های شناسایی‌شده برای شبکه محلی و PdaNet:")
    for ip in ips:
        print(f"   • IP: {ip}")
    print("-" * 65)
    print("📱 آدرس‌های دسترسی مستقیم از طریق مرورگر گوشی (PWA):")
    print(f"   1. Bybit Futures Scalp Lab:  http://{ips[0]}:8787   [وضعیت سرور: {'🟢 روشن' if crypto_running else '🔴 خاموش'}]")
    print(f"   2. LyraX Clip & Lyric Studio: http://{ips[0]}:5000   [وضعیت سرور: {'🟢 روشن' if lyrax_running else '🔴 خاموش'}]")
    print("-" * 65)
    print("📦 پروژه‌های آماده سورس اندروید استودیو (Native Android Studio Projects):")
    print("   • android/CryptoScalpLab/ (پروژه کامل اپ اندروید فیوچرز بای‌بیت)")
    print("   • android/LyraXStudio/    (پروژه کامل اپ اندروید استودیو لیریکس)")
    print("-" * 65)
    print("💡 روش‌های سریع اجرا روی گوشی:")
    print("   روش ۱ (فوری و بدون نیاز به بیلد): باز کردن آدرس‌ها در کروم گوشی و زدن 'Install App'")
    print("   روش ۲ (بیلد APK بومی): باز کردن پوشه android/* در Android Studio و زدن 'Build APK'")
    print("   روش ۳ (ابزار ابری PWABuilder): استفاده از https://pwabuilder.com برای خروجی مستقیم Signed APK")
    print("=" * 65)

if __name__ == "__main__":
    generate_mobile_summary()
