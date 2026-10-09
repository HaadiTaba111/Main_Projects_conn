# ☁️ راهنمای جامع استقرار و اجرای پروژه‌ها روی PythonAnywhere و هاست‌های رایگان ابری

این راهنما برای داداش هادی عزیز تهیه شده تا بتواند برنامه‌های پایتونی (استودیو لیریکس، ربات تور ماهیگیری و لانچر) را به‌صورت **۲۴ ساعته ابری و رایگان** روی اینترنت اجرا کند:

---

## 🧐 ۱. آیا می‌توان پروژه‌ها را روی PythonAnywhere گذاشت؟

### 🟢 پاسخ کوتاه:
**بله، ۱۰۰٪ برای پروژه‌های پایتونی (استودیو لیریکس LyraX و موتور تریدینگ Net Fishing)!**

### 📊 بررسی فنی وضعیت سرویس‌ها روی PythonAnywhere:

| پروژه / ماژول | زبان و فریم‌ورک | قابلیت اجرا روی PythonAnywhere | توضیحات فنی |
| :--- | :---: | :---: | :--- |
| **🎬 LyraX Clip Studio** | پایتون (Flask) | 🟢 ۱۰۰٪ عالی | به صورت Web App تحت پروتکل WSGI به راحتی روی دامنه رایگان `username.pythonanywhere.com` بالا می‌آید. |
| **🎣 موتور تور ماهیگیری (`net_fishing_engine.py`)** | پایتون خالص | 🟢 عالی (با منبع CoinGecko) | در پلن رایگان پایتون‌انی‌ور، دسترسی به `api.coingecko.com` در لیست سفید رسمی است و ۲۴ ساعته کار می‌کند. |
| **🎛️ لانچر Master Commander** | پایتون | 🟢 قابل اجرا | به عنوان وب‌اپلیکیشن مرکزی پایتون کار می‌کند. |
| **📱 Futures PWA / Automated Bot** | نودجی‌اس (Node.js) | 🔴 نیاز به هاست دیگر (مثل Render) | پایتون‌انی‌ور فقط از زبان پایتون پشتیبانی می‌کند؛ برای نودجی‌اس پلتفرم رایگان **Render.com** پیشنهاد می‌شود. |

---

## 🛠️ ۲. مراحل گام‌به‌گام راه‌اندازی روی PythonAnywhere (پلن ۱۰۰٪ رایگان)

### مرحله ۱: ساخت اکانت و باز کردن کنسول Bash
1. در سایت [PythonAnywhere.com](https://www.pythonanywhere.com) ثبت‌نام رایگان (Beginner Account) انجام بده.
2. از تب **Consoles**، یک کنسول **Bash** باز کن.

---

### مرحله ۲: کلون کردن ریپوزیتوری و نصب پکیج‌ها
دستورات زیر را در کنسول Bash پایتون‌انی‌ور وارد کن:

```bash
# کلون کردن شاخه اصلی پروژه
git clone -b arena/01a0255b-main-arena-conn https://github.com/HaadiTaba111/Main_Arena_conn.git
cd Main_Arena_conn

# نصب پیش‌نیازهای پایتون
pip3 install --user flask pillow arabic-reshaper python-bidi python-dotenv
```

---

### مرحله ۳: راه‌اندازی وب‌اپلیکیشن استودیو لیریکس (LyraX Web App)
1. به تب **Web** در پنل کاربری PythonAnywhere برو و دکمه **Add a new web app** را بزن.
2. گزینه **Manual Configuration** ➔ پایتون نسخه **Python 3.11** یا **3.10** را انتخاب کن.
3. در صفحه تنظیمات:
   - **Source code directory:**  
     `/home/your_username/Main_Arena_conn/apps/clip-studio`
   - **Working directory:**  
     `/home/your_username/Main_Arena_conn/apps/clip-studio`
4. روی لینک فایل **WSGI configuration file** کلیک کن و تمام محتوای داخلش را پاک کن و این ۳ خط را داخلش کپی کن:

```python
import sys
import os

path = '/home/your_username/Main_Arena_conn/apps/clip-studio'
if path not in sys.path:
    sys.path.insert(0, path)

from app import app as application
```
*(به جای `your_username`، نام کاربری اکانت پایتون‌انی‌ورت را بنویس).*

5. دکمه سبز **Reload** را در بالای صفحه بزن!
6. **تمام!** آدرس سایت تو (`https://your_username.pythonanywhere.com`) در اینترنت بالا می‌آید و از هر کجای دنیا روی گوشی بدون نیاز به سیستم در دسترست است!

---

### مرحله ۴: اجرای اتوترید تور ماهیگیری در پس‌زمینه (Always-On Task)
در کنسول Bash یا در تب **Tasks** دستور زیر را بزن:

```bash
cd ~/Main_Arena_conn/apps/futures-scalp-lab
python3 scalplab/net_fishing_engine.py --data coingecko --symbol BTCUSDT
```
این اسکریپت از طریق دیتای بدون فیلتر CoinGecko به صورت ۲۴ ساعته در پس‌زمینه اجرا می‌شود و لاگ‌ها را ذخیره می‌کند.

---

## 🌟 ۳. جایگزین عالی دیگر: هاست رایگان Render.com (برای پایتون + نودجی‌اس)

اگر خواستی هم برنامه‌های پایتون و هم برنامه‌های Node.js (مثل فیوچرز PWA) هم‌زمان روی یک هاست ابری رایگان ۲۴ ساعته کار کنند:
- پلتفرم **[Render.com](https://render.com)** به صورت ۱۰۰٪ رایگان به گیت‌هاب تو وصل می‌شود، خودش پروژه را بیلد می‌کند و یک آدرس امن `https://your-app.onrender.com` تحویل می‌دهد که هیچ محدودیتی در اتصال به صرافی‌ها ندارد.
