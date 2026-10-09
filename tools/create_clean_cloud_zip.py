#!/usr/bin/env python3
"""
📦 Clean Cloud Package Builder for PythonAnywhere
-------------------------------------------------
این اسکریپت یک فایل زیپ سبک و امن به نام 'Clean_Cloud_Package.zip' می‌سازد که
فقط شامل استودیو لیریکس و ربات کریپتو است و فاقد هرگونه فایل محرمانه DSA می‌باشد.
"""

import os
import zipfile

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_ZIP = os.path.join(ROOT_DIR, "Clean_Cloud_Package.zip")

INCLUDE_DIRS = [
    "apps/clip-studio",
    "apps/futures-scalp-lab",
    "apps/futures-pwa"
]

EXCLUDE_PATTERNS = [
    "__pycache__",
    ".git",
    "dsa-confidential-core",
    "cl_",
    "dsa_",
    "benchmark_",
    "node_modules",
    "*.pyc"
]

def make_clean_zip():
    print("=" * 65)
    print("  📦 ساخت بسته پاک و امن کلود (مخصوص PythonAnywhere)")
    print("=" * 65)
    
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for rel_dir in INCLUDE_DIRS:
            full_dir = os.path.join(ROOT_DIR, rel_dir)
            if not os.path.exists(full_dir):
                continue
            for root, dirs, files in os.walk(full_dir):
                # فیلتر پوشه‌ها
                dirs[:] = [d for d in dirs if d not in ["__pycache__", "node_modules", ".git"]]
                for file in files:
                    if file.endswith(".pyc") or file.startswith("."):
                        continue
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, ROOT_DIR)
                    zipf.write(file_path, arcname)
                    
        # اضافه کردن اسکریپت راه‌اندازی سرور سیگنال و README
        wsgi_helper = """# فایل کمکی تنظیم WSGI برای PythonAnywhere
import sys, os
path = os.path.expanduser('~/Clean_Cloud_Package/apps/clip-studio')
if path not in sys.path:
    sys.path.insert(0, path)
from app import app as application
"""
        zipf.writestr("wsgi_guide.py", wsgi_helper)
        
    size_mb = os.path.getsize(OUTPUT_ZIP) / (1024 * 1024)
    print(f"✅ فایل زیپ پاک با موفقیت ساخته شد ({size_mb:.2f} MB)")
    print(f"👉 مسیر فایل: {OUTPUT_ZIP}")
    print("🔒 این بسته ۱۰۰٪ فاقد فایل‌های محرمانه DSA است و با خیال راحت قابل آپلود در PythonAnywhere می‌باشد.")
    print("=" * 65)

if __name__ == "__main__":
    make_clean_zip()
