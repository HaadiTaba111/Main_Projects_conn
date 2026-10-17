# اجرای خودکار — Termux و VSCode

## 📱 Termux (یک بار کپی/پیست کنید)
```bash
curl -fsSL https://raw.githubusercontent.com/HaadiTaba111/Main_Projects_conn/arena/2f3dab30-main-projects-conn/bootstrap/termux.sh -o ~/termux.sh && bash ~/termux.sh
```
خودش git و پایتون نصب می‌کند، ریپو را کلون (یا آپدیت) می‌کند، داشبورد و سرویس چشم‌ودست را بالا می‌آورد و مرورگر را روی داشبورد باز می‌کند. دفعات بعد فقط `bash ~/termux.sh`.

## 💻 VSCode
1. یک بار ریپو را بگیرید و پوشه را در VSCode باز کنید:
   ```bash
   git clone -b arena/2f3dab30-main-projects-conn https://github.com/HaadiTaba111/Main_Projects_conn.git && code Main_Projects_conn
   ```
2. از این به بعد **با هر بار بازکردن پوشه در VSCode**، تسک خودکار (`bootstrap/dev.sh`) اجرا می‌شود: کد آپدیت و هر دو سرویس بالا می‌آیند و خروجی در ترمینال VSCode دیده می‌شود. (اگر VSCode پرسید «Allow Automatic Tasks» را تأیید کنید؛ در تنظیمات پروژه از قبل `on` است.)
3. داشبورد: http://127.0.0.1:8000

## 🐧 حدود منابع روی اوبونتو ۲۲.۰۴
```bash
cd agent-router-dashboard/eye-hand-service
bash install-ubuntu22.sh                 # سرویس چشم‌ودست با MemoryMax=768M و CPUQuota=150%
sudo bash limit-ollama.sh 6G 300%        # محدودکردن Ollama: RAM تا 6G و CPU تا 300%
```
مقادیر در فایل نصب و آرگومان‌های اسکریپت قابل تغییرند؛ مقدار مصرف و سقف cgroup در تب «فعالیت زنده ← منابع» دیده می‌شود.
