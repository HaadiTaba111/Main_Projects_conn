// ===== Module: Agent Chains + Profile Import/Export + Eye decision routing =====
state.chain ??= [];
const ROLE_SYS = {
  translator_en:'Translate input Persian text to clear English. Output ONLY the translation.',
  translator_fa:'Translate input to natural Persian. Output ONLY the translation.',
  reasoner:'You are the main reasoning model. Answer accurately and concisely.',
  eye_analyst:'You receive a structured page summary (from logs). Decide the next step. End with exactly one line: ACTION: <xdotool shortcut like ctrl+l or none>',
  researcher:'Analyse the input using any web results included. Cite key points.',
  critic:'Critique the previous answer: find errors and produce an improved final version.',
};
const modelOpts = sel => unifiedModels().map(m=>`<option value="${esc(m)}" ${m===sel?'selected':''}>${m}</option>`).join('');
function loadChainPreset(){
  const main=$('mainModel')?.value||unifiedModels()[0]||'', tr=$('translatorModel')?.value||main;
  const p=$('chainPreset').value;
  state.chain = p==='translate'
    ? [{name:'مترجم ورودی',model:tr,role:'translator_en'},{name:'مدل اصلی',model:main,role:'reasoner'},{name:'مترجم خروجی',model:tr,role:'translator_fa'}]
    : p==='eye'
    ? [{name:'تحلیل چشم',model:main,role:'eye_analyst'}]
    : p==='eye_deepseek'
    ? [{name:'تحلیل چشم',model:main,role:'eye_analyst'},{name:'منتقد (بازبینی تصمیم)',model:main,role:'critic'},{name:'مترجم خروجی',model:tr,role:'translator_fa'}]
    : [{name:'تحلیل‌گر',model:main,role:'researcher'},{name:'منتقد',model:tr,role:'critic'}];
  save(); renderChain();
}
function renderChain(){
  const w=$('chainSteps'); if(!w) return;
  w.innerHTML = state.chain.map((s,i)=>`<div class="card" style="padding:12px">
    <div class="row"><b>قدم ${i+1}</b><input value="${esc(s.name)}" style="flex:1;width:auto" onchange="state.chain[${i}].name=this.value;save()">
    <select style="flex:1;width:auto" onchange="state.chain[${i}].model=this.value;save()">${modelOpts(s.model)}</select>
    <select style="width:190px" onchange="state.chain[${i}].role=this.value;save()">${Object.keys(ROLE_SYS).map(r=>`<option value="${r}" ${r===s.role?'selected':''}>${r}</option>`).join('')}</select>
    <button class="btn danger" onclick="state.chain.splice(${i},1);save();renderChain()">حذف</button></div>
    <pre class="code" id="chainOut${i}" style="min-height:50px;margin-top:8px">${esc(s.last||'—')}</pre></div>`).join('') || '<p class="muted">زنجیره خالی است — یک پریست بارگذاری کنید.</p>';
  const ed=$('eyeDecisionModel'); if(ed && !ed.innerHTML) ed.innerHTML=modelOpts($('mainModel')?.value);
}
function addChainStep(){ state.chain.push({name:'قدم جدید',model:unifiedModels()[0]||'',role:'reasoner'}); save(); renderChain(); }

async function runChain(){
  if(state.emergency) return toast('🛑 Emergency Stop فعال است');
  if(!state.chain.length) loadChainPreset();
  const epoch=runEpoch;
  let input=$('chainInput').value.trim() || $('agentInput')?.value.trim() || JSON.stringify(eyeParsed||{});
  act('agent','⛓️ شروع زنجیره ('+state.chain.length+' قدم)','running',input.slice(0,150));
  try{
    for(let i=0;i<state.chain.length;i++){
      checkEpoch(epoch); const s=state.chain[i];
      if(s.role.startsWith('translator') && state.modules.translator===false) throw new Error('ماژول مترجم خاموش است');
      if(s.role.startsWith('translator') && !await askPermission('translator')) throw new Error('دسترسی مترجم داده نشد');
      checkEpoch(epoch);
      act('agent',`قدم ${i+1}: ${s.name}`,'running',s.model);
      const extra = s.role==='eye_analyst' ? '\n\nPage summary:\n'+JSON.stringify(eyeParsed||parseEye()) : '';
      const r=await callModel(s.model,[{role:'system',content:ROLE_SYS[s.role]},{role:'user',content:input+extra}]);
      checkEpoch(epoch);
      s.last=r.text; input=r.text; save();
      const el=$('chainOut'+i); if(el) el.textContent=r.text;
      const m=r.text.match(/ACTION:\s*([a-z0-9+\-_]+)/i);
      if(m && m[1]!=='none'){ $('customShortcut').value=m[1]; act('hand','ACTION پیشنهاد شد (اجرا نشده)','wait',m[1]+' — در تب چشم‌ودست خودتان اجراش کنید'); }
      act('agent',`قدم ${i+1}: ${s.name}`,'done',(r.tokens||'')+'');
    }
    $('chainOutput').textContent=input; act('agent','⛓️ زنجیره تمام شد ✅','done');
  }catch(e){ act('agent','⛓️ زنجیره متوقف/خطا','error',e.message); $('chainOutput').textContent='❌ '+e.message; }
  renderChain();
}

// Eye -> (translator for text) -> DECISION model -> validated ACTION -> Hand (never translator -> hand)
const ACTION_WHITELIST = new Set(SHORTCUTS.map(x=>x[0].toLowerCase()));
async function runEyeDecision(){
  if(state.emergency) return toast('🛑 Emergency Stop فعال است');
  if(!eyeParsed) parseEye(); if(!eyeParsed) return;
  const model=$('eyeDecisionModel').value||$('mainModel')?.value; if(!model) return toast('مدل تصمیم‌گیر انتخاب نشده');
  act('eye','چشم → مدل تصمیم‌گیر','running',model);
  try{
    const r=await callModel(model,[{role:'system',content:ROLE_SYS.eye_analyst},{role:'user',content:($('eyeGoal').value||'بهترین قدم بعدی چیست؟')+'\n\n'+JSON.stringify(eyeParsed)}]);
    $('eyeAnswer').textContent=r.text;
    const m=r.text.match(/ACTION:\s*([a-z0-9+\-_]+)/i);
    if(m && ACTION_WHITELIST.has(m[1].toLowerCase())){ $('customShortcut').value=m[1]; toast('ACTION معتبر: '+m[1]+' (خودتان اجرا کنید)'); }
    else if(m) toast('⚠️ ACTION مدل در وایت‌لیست نبود و رد شد: '+m[1]);
    act('eye','تصمیم چشم گرفته شد','done',r.text.slice(0,200));
  }catch(e){ act('eye','تصمیم چشم','error',e.message); toast('❌ '+e.message); }
}

// Profile import / export
function exportProfiles(){
  download('permission-profiles.json', JSON.stringify({kind:'agentrouter-profiles',version:1,activeProfile:state.activeProfile,perms:state.perms,profiles:state.profiles,modules:state.modules},null,2));
  act('permission','خروجی پروفایل‌ها گرفته شد','done');
}
function importProfiles(inp){
  const f=inp.files[0]; if(!f) return;
  f.text().then(t=>{ const j=JSON.parse(t);
    if(j.kind!=='agentrouter-profiles') throw new Error('فرمت فایل درست نیست');
    if(j.perms) Object.keys(PERMS).forEach(k=>{ if(k in j.perms) state.perms[k]=!!j.perms[k]; });
    if(j.profiles) state.profiles={...state.profiles,...j.profiles};
    if(j.modules) state.modules={...state.modules,...j.modules};
    state.activeProfile=j.activeProfile||'(واردشده)'; save(); renderPerms(); renderModules();
    act('permission','پروفایل‌ها وارد شدند','done',Object.keys(j.profiles||{}).join(', ')); toast('✅ پروفایل‌ها وارد شدند');
  }).catch(e=>toast('❌ '+e.message));
}
// move chain card into the Agent tab + init
(function(){ const c=$('chainCard'), host=$('page-agent'); if(c&&host) host.appendChild(c); renderChain(); })();
