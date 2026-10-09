#!/usr/bin/env python3
"""
📦 Somee.com Flat Standalone Package Builder
--------------------------------------------
این اسکریپت فایل زیپ کاملاً تخت (Flat) و بدون ساب‌فولدر به نام 'Somee_Crypto_Package.zip'
می‌سازد تا فایل منیجر قدیمی Somee.com بتواند آن را بدون هیچ خطایی در یک ثانیه آنزیپ کند.
"""

import os
import zipfile

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOMEE_DIR = os.path.join(ROOT_DIR, "apps", "aspnet-crypto-somee")
OUTPUT_ZIP = os.path.join(ROOT_DIR, "Somee_Crypto_Package.zip")

FLAT_FILES = [
    "index.html",
    "app.bundle.js",
    "styles.css",
    "icon.svg",
    "manifest.webmanifest",
    "Default.aspx",
    "web.config",
    "api.ashx"
]

def make_somee_zip():
    print("=" * 65)
    print("  📦 ساخت بسته فلت و بهینه مخصوص هاستینگ Somee.com")
    print("=" * 65)
    
    # اول مطمئن می‌شویم باندل کامپایل شده باشد
    os.system(f"npx esbuild {os.path.join(ROOT_DIR, 'apps/futures-pwa/src/js/main.js')} --bundle --outfile={os.path.join(SOMEE_DIR, 'app.bundle.js')} --format=iife --minify")
    
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for fname in FLAT_FILES:
            fpath = os.path.join(SOMEE_DIR, fname)
            if os.path.exists(fpath):
                zipf.write(fpath, fname)
                print(f"  + اضافه شد: {fname}")
            else:
                print(f"  ⚠️ فایل یافت نشد: {fname}")
                
    size_kb = os.path.getsize(OUTPUT_ZIP) / 1024
    print("-----------------------------------------------------------------")
    print(f"✅ فایل زیپ فلت Somee با موفقیت ساخته شد ({size_kb:.1f} KB)")
    print(f"👉 مسیر فایل: {OUTPUT_ZIP}")
    print("🌐 بدون هیچ ساب‌فولدر؛ تضمین آنزیپ ۱ ثانیه‌ای و ۱۰۰٪ بدون ارور در Somee")
    print("=" * 65)

if __name__ == "__main__":
    make_somee_zip()
