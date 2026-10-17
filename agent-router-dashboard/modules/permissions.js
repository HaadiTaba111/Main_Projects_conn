// ===== Module: Permissions & Profiles (nothing runs without asking) =====
const PERMS = {
  api_external:   {label:'🌐 ارسال به API خارجی (AgentRouter)', risk:'متوسط', desc:'متن/سؤال برای مدل ابری ارسال می‌شود'},
  ollama_local:   {label:'🦙 استفاده از Ollama محلی', risk:'کم', desc:'فقط روی همین سیستم اوبونتو'},
  internet_search:{label:'🔎 جستجوی اینترنت', risk:'متوسط', desc:'ایجنت می‌تواند وب را جستجو کند'},
  translator:     {label:'🔤 مدل مترجم واسط', risk:'کم', desc:'ترجمه فارسی↔انگلیسی بین شما و مدل اصلی'},
  eye_log:        {label:'👁️📜 چشم: خواندن لاگ صفحه', risk:'کم', desc:'فقط فایل لاگ صفحه خوانده می‌شود'},
  eye_screenshot: {label:'👁️🖼️ چشم: اسکرین‌شات', risk:'متوسط', desc:'تصویر صفحه گرفته/ارسال می‌شود'},
  eye_camera:     {label:'👁️📷 چشم: دوربین', risk:'زیاد', desc:'دوربین روشن می‌شود — فقط عنداللزوم'},
  hand_shortcut:  {label:'⌨️ دست: Shortcut و تایپ', risk:'متوسط', desc:'xdotool key/type روی اوبونتو'},
  hand_mouse:     {label:'🖱️ دست: حرکت و کلیک ماوس', risk:'زیاد', desc:'xdotool mousemove/click — فقط عنداللزوم'},
  hand_macro:     {label:'▶️ دست: اجرای ماکرو', risk:'زیاد', desc:'چند فرمان پشت سر هم بدون توقف'},
};
const BUILTIN_PROFILES = {
  '👀 فقط مشاهده':            {eye_log:1, ollama_local:1},
  '⌨️ مرورگر با Shortcut':    {eye_log:1, ollama_local:1, api_external:1, hand_shortcut:1, translator:1},
  '🌐 تحقیق اینترنتی':        {eye_log:1, ollama_local:1, api_external:1, hand_shortcut:1, translator:1, internet_search:1},
  '🖱️ کنترل کامل اوبونتو ⚠️': {eye_log:1, eye_screenshot:1, eye_camera:1, ollama_local:1, api_external:1, hand_shortcut:1, hand_mouse:1, hand_macro:1, translator:1, internet_search:1},
};
state.perms ??= {}; state.modules ??= {}; state.profiles ??= {}; state.activeProfile ??= ''; state.activities ??= [];
Object.keys(PERMS).forEach(k => state.perms[k] ??= false);   // default: OFF — must ask
const tempGrants = new Set();
const hasPerm = k => !!(state.perms[k] || tempGrants.has(k));

// Ask-the-user modal: returns Promise<boolean>
function askPermission(k){
  if (hasPerm(k)) return Promise.resolve(true);
  return new Promise(res=>{
    const m=document.createElement('div'); m.className='modal open';
    m.innerHTML=`<div class="dialog"><h3 style="margin-top:0">🔐 درخواست دسترسی</h3>
      <p><b>${PERMS[k].label}</b> <span class="pill warn">ریسک: ${PERMS[k].risk}</span></p>
      <p class="muted">${PERMS[k].desc}</p><p class="muted">ایجنت برای ادامه به این دسترسی نیاز دارد. فعال شود؟</p>
      <div class="row"><button class="btn primary" id="paAlways">✅ فعال کن (از این به بعد)</button>
      <button class="btn" id="paOnce">فقط همین یک بار</button>
      <button class="btn danger" id="paNo">❌ رد</button></div></div>`;
    document.body.appendChild(m);
    const done=v=>{m.remove();res(v)};
    m.querySelector('#paAlways').onclick=()=>{state.perms[k]=true; state.activeProfile='(دستی)'; save(); renderPerms(); act('permission',PERMS[k].label,'done','فعال شد (دائمی)'); done(true)};
    m.querySelector('#paOnce').onclick=()=>{tempGrants.add(k); act('permission',PERMS[k].label,'done','فقط همین یک بار اجازه داده شد'); done(true)};
    m.querySelector('#paNo').onclick=()=>{act('permission',PERMS[k].label,'error','کاربر رد کرد'); done(false)};
  });
}
async function ensureModulePerms(perms){ for(const k of perms){ if(!(await askPermission(k))) { toast('⛔ بدون دسترسی «'+PERMS[k].label+'» ادامه نمی‌دهم'); return false; } } return true; }

function allProfiles(){ return {...BUILTIN_PROFILES, ...state.profiles}; }
function renderPerms(){
  const sel=$('profileSelect'); if(!sel) return;
  sel.innerHTML=Object.keys(allProfiles()).map(n=>`<option ${n===state.activeProfile?'selected':''}>${n}</option>`).join('');
  $('activeProfileLabel').textContent='پروفایل فعال: '+(state.activeProfile||'—')+' — دسترسی‌های روشن: '+(Object.keys(PERMS).filter(k=>state.perms[k]).length)+' از '+Object.keys(PERMS).length;
  $('permsList').innerHTML=Object.entries(PERMS).map(([k,v])=>`
    <div class="row" style="justify-content:space-between;background:#0b1220;border:1px solid var(--line);border-radius:12px;padding:10px 12px">
      <span><b>${v.label}</b> <span class="pill ${v.risk==='زیاد'?'bad':v.risk==='متوسط'?'warn':'ok'}">ریسک ${v.risk}</span><br><small class="muted">${v.desc}</small></span>
      <button class="btn ${state.perms[k]?'primary':''}" onclick="togglePerm('${k}')">${state.perms[k]?'🟢 روشن':'⚪ خاموش'}</button></div>`).join('');
}
function togglePerm(k){ state.perms[k]=!state.perms[k]; state.activeProfile='(دستی)'; save(); renderPerms(); act('permission',PERMS[k].label, state.perms[k]?'done':'error', state.perms[k]?'روشن شد':'خاموش شد'); }
function applySelectedProfile(){
  const n=$('profileSelect').value, map=allProfiles()[n]; if(!map) return;
  Object.keys(PERMS).forEach(k=>state.perms[k]=!!map[k]); state.activeProfile=n; save(); renderPerms(); renderModules();
  act('permission','پروفایل «'+n+'»','done','دسترسی‌ها طبق پروفایل اعمال شد'); toast('پروفایل فعال شد: '+n);
}
function saveCustomProfile(){
  const n=$('newProfileName').value.trim(); if(!n) return toast('اول یک نام برای پروفایل بنویسید');
  state.profiles[n]={...state.perms}; state.activeProfile=n; save(); renderPerms(); toast('پروفایل «'+n+'» ذخیره شد ✅');
}
function deleteCustomProfile(){ const n=$('profileSelect').value; if(state.profiles[n]){ delete state.profiles[n]; save(); renderPerms(); toast('حذف شد'); } else toast('پروفایل‌های آماده قابل حذف نیستند'); }
