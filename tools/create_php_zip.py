#!/usr/bin/env python3
"""
📦 PHP Crypto Hub Package Builder
---------------------------------
این اسکریپت یک فایل زیپ سبک و آماده به نام 'PHP_Crypto_Package.zip' می‌سازد
که روی تمام هاست‌های رایگان PHP (سی‌پنل، دایرکت‌ادمین، InfinityFree) آپلود و اجرا می‌شود.
"""

import os
import zipfile

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PHP_DIR = os.path.join(ROOT_DIR, "apps", "php-crypto-hub")
OUTPUT_ZIP = os.path.join(ROOT_DIR, "PHP_Crypto_Package.zip")

def make_php_zip():
    print("=" * 65)
    print("  📦 ساخت بسته PHP مخصوص تمام هاست‌های رایگان و CPanel")
    print("=" * 65)
    
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(PHP_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, PHP_DIR)
                zipf.write(file_path, arcname)
                
    size_kb = os.path.getsize(OUTPUT_ZIP) / 1024
    print(f"✅ فایل زیپ PHP با موفقیت ساخته شد ({size_kb:.1f} KB)")
    print(f"👉 مسیر فایل: {OUTPUT_ZIP}")
    print("🌐 کافیست این فایل را در هر هاست PHP (public_html) آپلود و Extract کنید.")
    print("=" * 65)

if __name__ == "__main__":
    make_php_zip()
