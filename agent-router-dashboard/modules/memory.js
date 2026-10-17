// ===== Module: Experience Memory & Learned Skills (routine without the brain) =====
// Flow: Eye sees situation -> Brain decides -> you execute + confirm -> Skill is stored.
// Next time the same situation appears, the Skill runs directly; the main model is NOT called.
state.skills ??= []; state.experiences ??= []; state.brainSaved ??= 0;
save();

function eyeSignature(p){
  if(!p) return '';
  return [p.url||'', p.title||'', (p.inputs||[]).join(','), (p.buttons||[]).slice(0,5).join(',')].join('|').toLowerCase();
}
function findSkill(p){
  const sig=eyeSignature(p); if(!sig) return null;
  return state.skills.find(s=>s.enabled && s.signature===sig) ||
         state.skills.find(s=>s.enabled && s.urlPattern && p.url && p.url.includes(s.urlPattern)) || null;
}
function logExperience(kind, text){
  state.experiences.unshift({id:Date.now()+Math.random(), time:Date.now(), kind, text:String(text).slice(0,400)});
  state.experiences=state.experiences.slice(0,200); save(); renderMemory();
}

// 1) Learn: wrap sendShortcut — if an eye situation is known, execution + confirm becomes a Skill
const _sendShortcut2 = sendShortcut;
sendShortcut = async function(keys){
  const before = eyeParsed ? eyeSignature(eyeParsed) : '';
  const r = await _sendShortcut2(keys);
  if(before){
    setTimeout(()=>{
      if(!confirm('این عمل برای وضعیت فعلی صفحه انجام شد؟ نتیجه موفق بود؟\nتأیید = به‌عنوان «مهارت روتین» یاد می‌گیرم تا دفعه بعد از مغز نپرسم.')) { logExperience('یادگیری رد شد','کاربر موفقیت «'+keys+'» را تأیید نکرد'); return; }
      let sk=state.skills.find(s=>s.signature===before);
      if(!sk){ sk={id:'sk'+Date.now(), name:'روتین: '+(eyeParsed.title||eyeParsed.url||'صفحه'), signature:before,
                   urlPattern:(eyeParsed.url||'').replace(/^https?:\/\/[^/]+/,'').slice(0,60), goal:'',
                   actions:[], uses:0, successes:0, failures:0, enabled:true, created:Date.now()};
               state.skills.push(sk); }
      if(!sk.actions.some(a=>a.type==='key'&&a.value===keys)) sk.actions.push({type:'key',value:keys});
      sk.uses++; sk.successes++; save(); renderMemory();
      logExperience('🧠 مهارت یاد گرفته شد', sk.name+' ← '+keys); toast('🧠 یاد گرفتمش! دفعه بعد بدون مغز انجامش می‌دم');
    }, 300);
  }
  return r;
};

// 2) Bypass: wrap the eye decision — a known Skill means NO main-model call
const _runEyeDecision = runEyeDecision;
runEyeDecision = async function(){
  if(!eyeParsed) parseEye();
  const sk = findSkill(eyeParsed);
  if(sk && sk.successes>=1){
    state.brainSaved++; save();
    act('eye','🧠 مهارت آشنا پیدا شد — مغز صدا زده نشد','done',sk.name+' ('+sk.successes+' اجرای موفق)');
    logExperience('⚡ اجرای بدون مغز پیشنهاد شد', sk.name);
    $('eyeAnswer').innerHTML = '🧠 این وضعیت را قبلاً یاد گرفته‌ام: <b>'+esc(sk.name)+'</b><br>بدون پرسیدن از مدل اصلی انجامش می‌دم؟'
      +'<br><br><button class="btn primary" onclick="runSkill(\''+sk.id+'\')">▶ اجرای مهارت (بدون مغز)</button> '
      +'<button class="btn" onclick="askBrainAnyway()">نه، از مغز بپرس</button>';
    renderMemory(); return;
  }
  return _runEyeDecision();
};
function askBrainAnyway(){ act('eye','کاربر خواست از مغز پرسیده شود','running'); return _runEyeDecision(); }

// 3) Run a learned skill directly through the hand (permissions + emergency still apply)
async function runSkill(id){
  const sk=state.skills.find(s=>s.id===id); if(!sk) return;
  if(state.emergency) return toast('🛑 Emergency Stop فعال است');
  if(state.modules.hand_keys===false) return toast('ماژول Shortcut خاموش است');
  if(!await askPermission('hand_shortcut')) return;
  act('hand','🧠 اجرای مهارت: '+sk.name,'running',sk.actions.map(a=>a.value).join(' → '));
  let ok=true;
  for(const a of sk.actions){ try{ if(a.type==='key') await ehPost('/hand/shortcut',{keys:a.value}); else if(a.type==='type') await ehPost('/hand/type',{text:a.value}); }catch(e){ ok=false; act('hand','مهارت','error',e.message); break; } }
  sk.uses++; ok?sk.successes++:sk.failures++; sk.lastUsed=Date.now(); save(); renderMemory();
  act('hand','مهارت «'+sk.name+'» '+(ok?'تمام شد ✅':'ناموفق'), ok?'done':'error');
  logExperience(ok?'✅ مهارت اجرا شد':'❌ مهارت ناموفق بود', sk.name);
  toast(ok?'✅ مهارت بدون مغز انجام شد':'❌ اجرای مهارت ناموفق بود');
  if(!ok && confirm('مهارت ناموفق بود. برای این وضعیت از مغز (مدل اصلی) بپرسم؟')) return _runEyeDecision();
}
function createSkillFromMacro(){
  const name=$('skillName').value.trim()||'مهارت دستی';
  const steps=$('macroText').value.split(/\n+/).filter(Boolean).map(l=>{const i=l.indexOf(':');return{type:l.slice(0,i).trim()==='key'?'key':'type',value:l.slice(i+1).trim()}});
  state.skills.push({id:'sk'+Date.now(),name,signature:'',urlPattern:$('skillUrl').value.trim(),goal:'',actions:steps,uses:0,successes:1,failures:0,enabled:true,created:Date.now()});
  save(); renderMemory(); toast('مهارت دستی ساخته شد ✅'); logExperience('مهارت دستی ساخته شد',name);
}
function toggleSkill(id){ const s=state.skills.find(x=>x.id===id); s.enabled=!s.enabled; save(); renderMemory(); }
function delSkill(id){ if(confirm('این مهارت حذف شود؟')){ state.skills=state.skills.filter(x=>x.id!==id); save(); renderMemory(); } }

function renderMemory(){
  if(!$('skillsList')) return;
  const uses=state.skills.reduce((t,s)=>t+s.uses,0), suc=state.skills.reduce((t,s)=>t+s.successes,0);
  $('mSkills').textContent=state.skills.length; $('mSaved').textContent=state.brainSaved||0;
  $('mExp').textContent=state.experiences.length; $('mRate').textContent=uses?Math.round(100*suc/uses)+'٪':'—';
  $('skillsList').innerHTML = state.skills.length ? state.skills.map(s=>`
    <div class="card" style="padding:14px"><div class="row" style="justify-content:space-between">
      <span><b>${esc(s.name)}</b> ${s.successes>=1?'<span class="pill ok">قابل اعتماد</span>':'<span class="pill warn">تازه‌کار</span>'} ${s.enabled?'<span class="pill ok">فعال</span>':'<span class="pill bad">غیرفعال</span>'}
      <br><small class="muted">الگو: <span class="mono">${esc(s.urlPattern||s.signature.slice(0,60))}</span> • اجرا: ${s.uses} • موفق: ${s.successes} • ناموفق: ${s.failures}</small>
      <br><small class="mono">${s.actions.map(a=>esc(a.value)).join(' → ')}</small></span>
      <span class="row"><button class="btn primary" onclick="runSkill('${s.id}')">▶ اجرا بدون مغز</button>
      <button class="btn" onclick="toggleSkill('${s.id}')">${s.enabled?'غیرفعال':'فعال'}</button>
      <button class="btn danger" onclick="delSkill('${s.id}')">حذف</button></span></div></div>`).join('')
    : '<p class="muted">هنوز مهارتی یاد گرفته نشده — یک بار از مسیر چشم→مدل→اجرا بروید و تأیید کنید، یا از ماکرو مهارت دستی بسازید.</p>';
  $('expList').innerHTML = state.experiences.length ? state.experiences.slice(0,40).map(e=>`
    <div style="background:#0b1220;border:1px solid var(--line);border-radius:12px;padding:9px 12px">
    <b>${esc(e.kind)}</b> <span class="muted">${new Date(e.time).toLocaleString('fa-IR')}</span><div class="muted">${esc(e.text)}</div></div>`).join('')
    : '<p class="muted">هنوز تجربه‌ای ثبت نشده.</p>';
}
// record agent/chain completions as experience too
const _act2 = act;
act = function(m,s,st,d){ const r=_act2(m,s,st,d); if(st==='done') logExperience('['+m+'] '+s, d||''); return r; };
renderMemory();
