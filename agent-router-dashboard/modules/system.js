// ===== Module: Clock + Scheduler + Resources + Loop Guard + Teaching =====
state.schedules ??= []; state.loopPaused ??= false; save();

// --- live clock in topbar (single source of time for scheduling) ---
(function clock(){
  const host=document.querySelector('.topbar .row'); if(!host) return;
  const el=document.createElement('span'); el.id='clockWidget'; el.className='pill ok'; el.style.fontSize='13px'; host.prepend(el);
  const tick=()=>{ const d=new Date();
    el.textContent='🕐 '+d.toLocaleDateString('fa-IR',{weekday:'short',day:'numeric',month:'short'})+' — '+d.toLocaleTimeString('fa-IR'); };
  tick(); setInterval(tick,1000);
})();

// --- resources (from Ubuntu service) ---
let lastResources=null;
async function refreshResources(manual){
  try{ const r=await fetch(ehBase()+'/resources'); lastResources=await r.json();
    const x=lastResources, gb=n=>(n/1073741824).toFixed(1)+'GB';
    $('resBox').innerHTML=`CPU: <b>${x.cpu_percent}%</b> • Load: ${x.load.map(v=>v.toFixed(2)).join(' / ')}<br>`+
      `RAM: <b>${x.ram_percent}%</b> (${gb(x.ram_used)} از ${gb(x.ram_total)})<br>دیسک: <b>${x.disk_percent}%</b> • آپتایم: ${Math.round(x.uptime_sec/3600)} ساعت`;
    if(x.ram_percent >= (+($('resRamLimit')?.value||90))) act('provider','⚠️ RAM بالای حد مجاز است','error',x.ram_percent+'% ≥ '+$('resRamLimit').value+'%');
  }catch(e){ if(manual) toast('سرویس اوبونتو نیست: '+e.message); $('resBox').textContent='سرویس اوبونتو در دسترس نیست (حالت آفلاین)'; }
}
const ramOk = () => !lastResources || lastResources.ram_percent < (+($('resRamLimit')?.value||90));
async function unloadOllamaModels(){
  if(!await askPermission('ollama_local')) return;
  for(const m of state.ollama.models){ try{ await fetch(ollamaBase()+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:m,keep_alive:0})}); }catch{} }
  act('provider','RAM مدل‌های Ollama آزاد شد','done',state.ollama.models.join(', ')); toast('مدل‌های Ollama از RAM خارج شدند'); setTimeout(refreshResources,800);
}
setInterval(refreshResources, 15000); setTimeout(refreshResources, 1200);

// --- loop guard: same action on same situation >=3x in 2 minutes => pause & ask human ---
const loopEvents=[];
const _sendFinal = sendShortcut;
sendShortcut = async function(keys){
  if(state.loopPaused) { toast('🌀 نگهبان لوپ مکث کرده — از تب فعالیت زنده «ادامه بده» را بزنید'); return; }
  const stamp=(eyeSignature(eyeParsed||{})+'#'+keys).toLowerCase(); const now=Date.now();
  loopEvents.push({stamp,now}); 
  const recent=loopEvents.filter(e=>e.stamp===stamp && now-e.now<120000);
  if(recent.length>=3){
    state.loopPaused=true; save();
    $('loopBox').innerHTML='🛑 <b>لوپ تشخیص داده شد!</b> عمل «'+esc(keys)+'» روی همین وضعیت صفحه '+recent.length+' بار در ۲ دقیقه تکرار شده. مکث کردم. کمک: وضعیت صفحه را عوض کنید، یا «از مغز بپرس»، یا «ادامه بده».';
    act('hand','🌀 لوپ تشخیص داده شد — مکث','error',keys+' ×'+recent.length); toast('🌀 لوپ! مکث کردم — تب فعالیت زنده را ببینید'); return;
  }
  return _sendFinal(keys);
};
function loopResume(){ state.loopPaused=false; loopEvents.length=0; save(); $('loopBox').textContent='نگهبان ریست شد؛ ادامه می‌دهیم.'; act('hand','نگهبان لوپ ریست شد','done'); }
function loopAskBrain(){ loopEvents.length=0; if(typeof askBrainAnyway==='function') askBrainAnyway(); }

// --- teaching by demonstration ---
let taughtTested=false;
function teachSteps(){ return $('teachSteps').value.split(/\n+/).filter(Boolean).map(l=>{const i=l.indexOf(':');const k=l.slice(0,i).trim();return{type:k==='key'?'key':(k==='sleep'?'sleep':'type'),value:l.slice(i+1).trim()}}); }
async function testTaughtSkill(){
  if(state.emergency) return toast('🛑 Emergency فعال است');
  if(!await askPermission('hand_shortcut')) return;
  act('hand','🧪 تست آموزش دستی','running',$('teachName').value);
  try{ const j=await ehPost('/hand/macro',{steps:teachSteps()}); handShow(j); taughtTested=true;
    $('teachStatus').textContent='✅ تست اجرا شد. اگر نتیجه درست بود، «ذخیره و فعال‌سازی» را بزنید.'; act('hand','تست آموزش دستی تمام شد','done');
  }catch(e){ $('teachStatus').textContent='❌ تست ناموفق: '+e.message+' (سرویس اوبونتو/دسترسی را چک کنید)'; }
}
function saveTaughtSkill(){
  if(!taughtTested && !confirm('بدون تست موفق ذخیره شود؟ (ریسک بیشتر)')) return;
  state.skills.push({id:'sk'+Date.now(), name:$('teachName').value.trim()||'فعالیت آموزش‌داده‌شده',
    signature:eyeParsed?eyeSignature(eyeParsed):'', urlPattern:$('teachUrl').value.trim(), goal:$('teachGoal').value.trim(),
    actions:teachSteps().filter(s=>s.type!=='sleep'), uses:0, successes:1, failures:0, enabled:true, created:Date.now(), source:'taught-by-user'});
  save(); renderMemory(); $('teachStatus').textContent='✅ مهارت ذخیره و فعال شد — از این به بعد بدون مغز پیشنهاد/اجرا می‌شود.';
  logExperience('🎓 مهارت با آموزش کاربر ساخته شد', $('teachName').value); toast('🎓 یاد گرفتمش!');
}

// --- scheduler (runs while dashboard is open; missed runs are reported) ---
function renderSchedules(){
  const w=$('scheduleList'); if(!w) return;
  const sk=$('schSkill'); if(sk) sk.innerHTML=state.skills.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')||'<option value="">مهارتی نیست</option>';
  w.innerHTML=state.schedules.map(t=>`<div style="background:#0b1220;border:1px solid var(--line);border-radius:10px;padding:8px 10px">
    <b>${esc(t.name)}</b> <span class="pill ${t.enabled?'ok':'bad'}">${t.enabled?'فعال':'خاموش'}</span><br>
    <small class="muted">${t.type} • هر ${t.every} دقیقه • بعدی: ${t.nextRun?new Date(t.nextRun).toLocaleTimeString('fa-IR'):'—'}${t.lastRun?' • قبلی: '+new Date(t.lastRun).toLocaleTimeString('fa-IR'):''}</small>
    <div class="row" style="margin-top:6px"><button class="btn" onclick="toggleSchedule('${t.id}')">${t.enabled?'خاموش':'روشن'}</button><button class="btn danger" onclick="delSchedule('${t.id}')">حذف</button></div></div>`).join('')||'<p class="muted">تسکی نیست.</p>';
}
function addSchedule(){
  const t={id:'sch'+Date.now(), name:$('schName').value.trim()||'تسک زمان‌بندی‌شده', type:$('schType').value,
           skillId:$('schSkill').value, every:Math.max(1,+$('schEvery').value||5), enabled:true,
           lastRun:0, nextRun:Date.now()+Math.max(1,+$('schEvery').value||5)*60000};
  state.schedules.push(t); save(); renderSchedules(); act('agent','⏰ تسک ساخته شد','done',t.name+' هر '+t.every+' دقیقه');
}
function toggleSchedule(id){ const t=state.schedules.find(x=>x.id===id); t.enabled=!t.enabled; if(t.enabled) t.nextRun=Date.now()+t.every*60000; save(); renderSchedules(); }
function delSchedule(id){ state.schedules=state.schedules.filter(x=>x.id!==id); save(); renderSchedules(); }
async function schedulerTick(){
  renderEmergency();
  for(const t of state.schedules){
    if(!t.enabled || Date.now()<t.nextRun) continue;
    t.lastRun=Date.now(); t.nextRun=Date.now()+t.every*60000; save();
    if(state.emergency){ act('agent','⏰ تسک رد شد (Emergency)','error',t.name); continue; }
    if(!ramOk()){ act('agent','⏰ تسک رد شد (RAM بالای حد)','error',t.name); continue; }
    act('agent','⏰ اجرای تسک: '+t.name,'running',t.type);
    try{
      if(t.type==='skill' && t.skillId) await runSkill(t.skillId);
      else if(t.type==='eye'){ await fetchLogFromUbuntu(); }
      else if(t.type==='chain'){ await runChain(); }
      act('agent','⏰ تسک تمام شد: '+t.name,'done');
    }catch(e){ act('agent','⏰ تسک خطا: '+t.name,'error',e.message); }
  }
  renderSchedules();
}
// missed-run report on load
state.schedules.forEach(t=>{ if(t.enabled && t.nextRun && Date.now()-t.nextRun>t.every*60000){ act('agent','⏰ تسک ازدست‌رفته (داشبورد بسته بود)','error',t.name); t.nextRun=Date.now()+t.every*60000; } });
setInterval(schedulerTick, 20000); renderSchedules();

// ===== Everything visible in the dashboard: Ubuntu service logs + global errors =====
async function refreshUbuntuLogs(){
  const box=$('ubuntuLogBox'); if(!box) return;
  try{ const r=await fetch(ehBase()+'/logs?lines=80'); const j=await r.json();
    box.textContent=j.logs.map(l=>l.time+'  '+l.msg).join('\n')||'لاگی نیست';
    box.scrollTop=1e9;
  }catch{ box.textContent='سرویس اوبونتو آفلاین است — لاگ‌های داشبورد (بالا) همچنان کامل ثبت می‌شوند.'; }
}
setInterval(()=>{ if($('ubuntuLogAuto')?.checked) refreshUbuntuLogs(); }, 5000);
setTimeout(refreshUbuntuLogs, 1500);
window.addEventListener('error', e=> act('provider','خطای جاوااسکریپت','error',e.message));
window.addEventListener('unhandledrejection', e=> act('provider','Promise ردشده','error',String(e.reason?.message||e.reason)));
