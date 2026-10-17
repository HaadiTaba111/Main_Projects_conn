// ===== Module: Modules registry & UI =====
const MODULES=[
 {id:'ollama',    icon:'🦙', name:'پروایدر Ollama',        tab:'agent',    perms:['ollama_local'],    desc:'مدل‌های محلی روی اوبونتو (رایگان، آفلاین)'},
 {id:'api',       icon:'🌐', name:'پروایدر API',           tab:'keys',     perms:['api_external'],    desc:'AgentRouter و هر API سازگار با OpenAI'},
 {id:'translator',icon:'🔤', name:'مترجم واسط',            tab:'agent',    perms:['translator'],      desc:'فارسی↔انگلیسی بین شما و مدلی مثل DeepSeek R1'},
 {id:'search',    icon:'🔎', name:'جستجوی اینترنت',         tab:'agent',    perms:['internet_search'], desc:'ایجنت قبل از پاسخ وب را می‌گردد (از سرویس اوبونتو)'},
 {id:'eye_log',   icon:'👁️📜', name:'چشم — لاگ صفحه',      tab:'eyehand',  perms:['eye_log'],         desc:'سریع‌ترین چشم؛ پیش‌فرض (دوربین نیست)'},
 {id:'eye_shot',  icon:'👁️🖼️', name:'چشم — اسکرین‌شات',   tab:'eyehand',  perms:['eye_screenshot'],  desc:'فقط وقتی لاگ/DOM کافی نیست'},
 {id:'eye_cam',   icon:'👁️📷', name:'چشم — دوربین',        tab:'eyehand',  perms:['eye_camera'],      desc:'فقط عنداللزوم؛ ریسک حریم خصوصی'},
 {id:'hand_keys', icon:'⌨️', name:'دست — Shortcut',        tab:'eyehand',  perms:['hand_shortcut'],   desc:'روش اصلی دست؛ سریع و دقیق'},
 {id:'mouse',     icon:'🖱️', name:'دست — ماوس',            tab:'eyehand',  perms:['hand_mouse'],      desc:'حرکت/کلیک؛ فقط وقتی Shortcut جواب نمی‌دهد'},
 {id:'macro',     icon:'▶️', name:'دست — ماکرو',           tab:'eyehand',  perms:['hand_macro'],      desc:'اجرای زنجیره‌ای فرمان‌ها'},
 {id:'activity',  icon:'📡', name:'مانیتور فعالیت زنده',   tab:'activity', perms:[],                  desc:'دیدن زنده اینکه ایجنت چه می‌کند و در چه وضعیتی است'},
];
MODULES.forEach(m=> state.modules[m.id] ??= (m.id!=='eye_cam' && m.id!=='mouse' && m.id!=='macro')); // sensitive ones default OFF
save();
function renderModules(){
  const g=$('modulesGrid'); if(!g) return;
  g.innerHTML=MODULES.map(m=>{ const on=state.modules[m.id]; const missing=m.perms.filter(k=>!hasPerm(k));
    return `<div class="card"><b>${m.icon} ${m.name}</b><p class="muted">${m.desc}</p>
    <p>${on?'<span class="pill ok">روشن</span>':'<span class="pill bad">خاموش</span>'}
    ${missing.length&&on?`<span class="pill warn">بدون دسترسی: ${missing.map(k=>PERMS[k].label).join('، ')}</span>`:''}</p>
    <div class="row"><button class="btn ${on?'danger':'primary'}" onclick="toggleModule('${m.id}')">${on?'خاموش کن':'روشن کن'}</button>
    <button class="btn" onclick="go('${m.tab}')">رفتن به تب مربوطه</button></div></div>`}).join('');
}
async function toggleModule(id){
  const m=MODULES.find(x=>x.id===id); const turnOn=!state.modules[id];
  if(turnOn && m.perms.length){ if(!await ensureModulePerms(m.perms)) { renderModules(); return; } }
  state.modules[id]=turnOn; save(); renderModules(); renderPerms();
  act('provider','ماژول «'+m.name+'»', turnOn?'done':'error', turnOn?'روشن شد':'خاموش شد');
}
// gate existing eye/hand entry points through modules+permissions
const _askModelEye = askModelEye;
askModelEye = async function(){
  const src=$('eyeSource').value;
  if(src==='camera'){ if(state.modules.eye_cam===false) return toast('ماژول دوربین خاموش است'); if(!await askPermission('eye_camera')) return; }
  else if(src==='screenshot'){ if(state.modules.eye_shot===false) return toast('ماژول اسکرین‌شات خاموش است'); if(!await askPermission('eye_screenshot')) return; }
  else { if(state.modules.eye_log===false) return toast('ماژول چشم-لاگ خاموش است'); if(!await askPermission('eye_log')) return; }
  act('eye','چشم: تحلیل با منبع '+src,'running'); const r=await _askModelEye(); act('eye','تحلیل چشم تمام شد','done'); return r;
};
const _sendShortcut = sendShortcut;
sendShortcut = async function(keys){
  if(state.modules.hand_keys===false) return toast('ماژول Shortcut خاموش است');
  if(!await askPermission('hand_shortcut')) return;
  act('hand','Shortcut: '+keys,'running'); const r=await _sendShortcut(keys); act('hand','Shortcut: '+keys,'done'); return r;
};
const _runMacro = runMacro;
runMacro = async function(){
  if(state.modules.macro===false) return toast('ماژول ماکرو خاموش است');
  if(!await askPermission('hand_macro')) return;
  act('hand','اجرای ماکرو','running'); const r=await _runMacro(); act('hand','ماکرو تمام شد','done'); return r;
};
// init
(function initModules(){
  if($('ollamaBase')) $('ollamaBase').value=state.ollama.base;
  renderPerms(); renderModules(); renderActivities(); refreshAllModels();
  const oldRenderAll = renderAll;
  renderAll = function(){ oldRenderAll(); renderModules(); renderActivities(); };
})();
