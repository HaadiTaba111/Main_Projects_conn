// ===== Module: Contextual Help & Documentation =====
// Every section has its own guide: press the "؟" button or hit F1 anywhere.
const HELP_TOPICS = {
  dashboard:{t:'📊 داشبورد', b:`نمای کلی سیستم: کلیدهای سالم، مدل‌های همگام‌شده، تعداد درخواست‌ها و توکن مصرفی، نمودار مصرف ۷ روز و آخرین درخواست‌ها.
    <br><b>کلیدهای مهم:</b> «حالت دمو» داده آزمایشی می‌سازد تا نمودار را ببینید؛ همه آمار از لاگ‌های واقعی خودتان ساخته می‌شود.`},
  keys:{t:'🔑 کلیدهای API', b:`کلیدهای AgentRouter را اینجا اضافه/ویرایش/حذف کنید. هر کلید می‌تواند Base URL جدا داشته باشد (پیش‌فرض <span class="mono">https://agentrouter.org/v1</span>).
    <br><b>تست:</b> اتصال و مدل‌ها را می‌سنجد و Latency می‌دهد. <b>فعال:</b> کلید منتخب برای همه بخش‌هاست. کلیدها فقط در مرورگر شما می‌مانند.`},
  models:{t:'🤖 مدل‌ها', b:`فهرست مدل‌های کلید فعال از <span class="mono">GET /models</span>. با جستجو فیلتر کنید و با «استفاده در چت» مدل را مستقیم به آزمایشگاه بفرستید. اگر خالی است، اول در تب کلیدها «تست/همگام‌سازی» بزنید.`},
  playground:{t:'💬 آزمایشگاه چت', b:`گفتگوی مستقیم و Streaming با مدل انتخاب‌شده. تنظیمات: System Prompt، دما (خلاقیت)، Max Tokens.
    <br><b>کلید میانبر:</b> Ctrl+Enter = ارسال. «توقف» استریم را قطع می‌کند. توکن و زمان هر پاسخ در داشبورد و لاگ ثبت می‌شود.`},
  agent:{t:'🤖 ایجنت و روتینگ مدل‌ها + ⛓️ زنجیره', b:`دو مدل هم‌زمان: <b>مدل اصلی</b> (مثل DeepSeek R1 از API) و <b>مترجم</b> (مثل Qwen روی Ollama). سؤال فارسی ← مترجم ← مدل اصلی ← مترجم ← جواب فارسی.
    <br><b>⛓️ زنجیره ایجنت‌ها</b> (پایین همین تب): خروجی هر قدم ورودی بعدی است؛ برای هر قدم مدل و نقش جدا (مترجم/اصلی/تحلیل‌گر چشم/منتقد) انتخاب می‌کنید. پریست‌ها:
    <br>• ترجمه+DeepSeek • چشم→تحلیل→دست • جستجو→تحلیل→نقد • <b>چشم → DeepSeek → منتقد → مترجم</b> (تصمیم چشم را منتقد بازبینی می‌کند، بعد برای شما فارسی می‌شود).
    <br>چک‌باکس «اول در اینترنت جستجو کن» نتایج وب را به مدل می‌دهد (دسترسی جدا می‌خواهد).`},
  activity:{t:'📡 فعالیت زنده، منابع، زمان‌بندی، لوپ', b:`اینجا می‌بینید ایجنت <b>الان</b> چه می‌کند: هر مرحله (ترجمه، جستجو، فکر مدل، Shortcut...) با وضعیت ⏳/✅/❌ و زمان.
    <br>• <b>منابع اوبونتو:</b> CPU/RAM/دیسک زنده + حد RAM؛ دکمه آزادسازی RAM مدل‌های Ollama.
    <br>• <b>نگهبان لوپ:</b> تکرار یک عمل روی یک وضعیت ≥۳ بار در ۲ دقیقه = مکث خودکار؛ «ادامه بده» یا «از مغز بپرس».
    <br>• <b>زمان‌بندی:</b> تسک دوره‌ای (مهارت/چشم/زنجیره)؛ فقط وقتی داشبورد باز است؛ تسک جاافتاده گزارش می‌شود. ساعت مرجع بالای داشبورد است.
    <br>• <b>لاگ سرویس اوبونتو</b> هم همین‌جا می‌آید؛ نیازی به کنسول نیست.`},
  modules:{t:'🧩 ماژول‌ها', b:`هر قابلیت یک ماژول مستقل است: Ollama، API، مترجم، جستجو، چشم-لاگ/اسکرین‌شات/دوربین، دست-Shortcut/ماوس/ماکرو و مانیتور فعالیت.
    <br>دوربین، ماوس و ماکرو پیش‌فرض خاموش‌اند (فقط عنداللزوم). روشن‌کردن ماژولی که دسترسی‌اش را ندارد، اول از شما اجازه می‌خواهد.`},
  perms:{t:'🔐 دسترسی‌ها و پروفایل‌ها', b:`هیچ دسترسی‌ای پیش‌فرض روشن نیست؛ ایجنت هنگام نیاز مودال می‌آورد: «فعال کن / فقط همین بار / رد».
    <br><b>پروفایل:</b> مجموعه‌ای از دسترسی‌ها با یک نام؛ با یک انتخاب همه‌اش به ایجنت داده می‌شود. پروفایل آماده: فقط مشاهده / مرورگر با Shortcut / تحقیق اینترنتی / کنترل کامل (خطرناک).
    <br>از وضعیت فعلی «پروفایل سفارشی» بسازید و با دکمه‌های Export/Import بین سیستم‌ها جابه‌جاش کنید.`},
  memory:{t:'🧠 حافظه، مهارت‌ها، پلی‌بوک و آموزش', b:`سه راه برای اینکه کارها بدون مغز (مدل اصلی) انجام شوند:
    <br>۱) <b>🌱 پلی‌بوک اولیه از مغز:</b> کارهای عرفی را خط‌به‌خط بنویسید، مغز یک بار خردشان می‌کند، شما تأیید می‌کنید.
    <br>۲) <b>🎓 آموزش توسط خودم:</b> قدم‌ها را خودتان می‌نویسید، تست می‌گیرید، فعال می‌کنید — برای روتین ثابت بهترین و ارزان‌ترین راه است.
    <br>۳) <b>یادگیری از تجربه:</b> اجرای موفقِ تصمیم مغز + تأیید شما = مهارت تازه.
    <br>تطبیق وضعیت صفحه دقیق یا فازی (≥۸۰٪) است؛ اگر مهارت ناموفق شود، پیشنهاد پرسیدن از مغز را می‌بینید. شمارنده «دفعات دورزدن مغز» صرفه‌جویی شماست.`},
  eyehand:{t:'👁️⌨️ چشم و دست', b:`<b>چشم</b> اول از لاگ صفحه می‌خواند (سریع‌ترین)؛ ترتیب: لاگ ← DOM ← اسکرین‌شات ← دوربین (فقط عنداللزوم). خلاصه ساخت‌یافته به «مدل تصمیم‌گیر» می‌رود، نه تصویر خام.
    <br><b>دست</b> اول با Shortcut کار می‌کند (۱۶ میانبر آماده + سفارشی + ماکرو)؛ ماوس ماژول جداست و فقط وقتی میانبر جواب نمی‌دهد.
    <br>مسیر تصمیم: چشم → Parser → (مترجم فقط برای متن) → مدل اصلی → ACTION (از وایت‌لیست) → دست، بعد از اجازه شما. پیشنهاد مدل هیچ‌وقت خودکار اجرا نمی‌شود.`},
  history:{t:'🕘 تاریخچه چت', b:`همه مکالمات آزمایشگاه و پاسخ‌های ایجنت با مدل، زمان، توکن و متن کامل. «کپی پاسخ» و پاک‌کردن کلی در دسترس است.`},
  logs:{t:'📜 لاگ درخواست‌ها', b:`ریز همه درخواست‌ها: زمان، کلید، مسیر، موفق/خطا، زمان پاسخ و توکن. خروجی JSON برای بررسی یا بایگانی.`},
  snippets:{t:'🧩 نمونه‌کدها', b:`کد آماده cURL و Python و JavaScript بر اساس کلید و مدل فعال شما (کلید ماسک‌شده نمایش داده می‌شود؛ در محیط امن خودتان جایگزین کنید).`},
  docs:{t:'📖 راهنما و مستندات', b:`همین صفحه: راهنمای همه بخش‌ها با جستجو. راهنمای زمینه‌ای هم همه‌جا هست: دکمه «؟ راهنمای این بخش» بالای هر تب و کلید <b>F1</b>. سند کامل متنی: <span class="mono">docs/USER-GUIDE.md</span> در ریپو و <span class="mono">bootstrap/README.md</span> برای اجرای خودکار Termux/VSCode.`},
  settings:{t:'⚙️ تنظیمات', b:`Base URL پیش‌فرض کلیدهای تازه، مهلت درخواست (Timeout)، بکاپ‌گیری/بازیابی همه داده‌ها و ریست کامل. اگر خطای CORS گرفتید، آدرس پروکسی/بک‌اند خودتان را به‌عنوان Base URL بدهید.`},
};
let currentPage='dashboard';
const _goHelp = go;
go = function(p){ _goHelp(p); currentPage=p; mountHelpButton(); };

function mountHelpButton(){
  const page=$('page-'+currentPage); if(!page || page.querySelector('.page-help-btn')) return;
  const btn=document.createElement('button'); btn.className='btn page-help-btn';
  btn.textContent='؟ راهنمای این بخش'; btn.style.marginBottom='12px';
  btn.onclick=()=>openHelp(currentPage);
  page.prepend(btn);
}
function openHelp(page){
  const t=HELP_TOPICS[page]||HELP_TOPICS.docs;
  let d=$('helpDrawer');
  if(!d){ d=document.createElement('div'); d.id='helpDrawer'; d.className='modal';
    d.innerHTML='<div class="dialog"><div class="row" style="justify-content:space-between"><h3 id="helpTitle" style="margin:0"></h3><button class="btn" onclick="document.getElementById(\'helpDrawer\').classList.remove(\'open\')">✖ بستن</button></div><div id="helpBody" class="muted" style="line-height:2.1;margin-top:12px"></div><div class="row" style="margin-top:14px"><button class="btn primary" onclick="document.getElementById(\'helpDrawer\').classList.remove(\'open\');go(\'docs\')">📖 بازکردن مستندات کامل</button></div></div>';
    document.body.appendChild(d); }
  $('helpTitle').textContent=t.t; $('helpBody').innerHTML=t.b; d.classList.add('open');
}
document.addEventListener('keydown', e=>{
  if(e.key==='F1'){ e.preventDefault(); openHelp(currentPage); }
});
function renderDocs(){
  const w=$('docsList'); if(!w) return;
  const q=($('docsSearch')?.value||'').trim();
  w.innerHTML=Object.entries(HELP_TOPICS)
    .filter(([k,v])=>!q || v.t.includes(q) || v.b.replace(/<[^>]+>/g,'').includes(q))
    .map(([k,v])=>`<div class="card"><b>${v.t}</b><p class="muted" style="line-height:2.1">${v.b}</p><button class="btn" onclick="go('${k}')">رفتن به این بخش</button></div>`).join('')
    || '<p class="muted">چیزی پیدا نشد.</p>';
}
mountHelpButton(); renderDocs();
