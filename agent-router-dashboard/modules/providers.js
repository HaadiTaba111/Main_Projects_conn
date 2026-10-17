// ===== Module: Providers — AgentRouter API + Ollama, one unified call =====
state.ollama ??= {base:'http://127.0.0.1:11434', models:[]};
const ollamaBase=()=>($('ollamaBase')?.value||state.ollama.base).replace(/\/$/,'');

async function testOllama(){
  state.ollama.base=ollamaBase(); const a=act('provider','اتصال به Ollama','running',state.ollama.base);
  try{ const r=await fetch(ollamaBase()+'/api/tags'); const j=await r.json();
    state.ollama.models=(j.models||[]).map(m=>m.name); save();
    $('ollamaStatus').textContent='Ollama: متصل ✅ '+state.ollama.models.length+' مدل'; $('ollamaStatus').className='pill ok';
    act('provider','مدل‌های Ollama دریافت شد','done',state.ollama.models.join(', ')||'مدلی نصب نیست'); refreshAllModels();
  }catch(e){ $('ollamaStatus').textContent='Ollama: در دسترس نیست'; $('ollamaStatus').className='pill bad';
    act('provider','اتصال به Ollama','error',e.message+' — ollama serve اجرا هست؟'); }
}
function unifiedModels(){
  return [ ...state.models.map(m=>'api:'+m), ...state.ollama.models.map(m=>'ollama:'+m) ];
}
function refreshAllModels(){
  const fill=(id,prefer)=>{ const el=$(id); if(!el) return; const cur=el.value;
    el.innerHTML=unifiedModels().map(m=>`<option value="${esc(m)}" ${m===prefer||m===cur?'selected':''}>${m.startsWith('ollama:')?'🦙':'🌐'} ${esc(m.split(':').slice(1).join(':'))}</option>`).join('')||'<option value="">مدلی نیست — API را همگام یا Ollama را تست کنید</option>'; };
  // sensible defaults: main = DeepSeek/API if present, translator = ollama/qwen if present
  const mainPref=unifiedModels().find(m=>/deepseek/i.test(m))||unifiedModels()[0];
  const trPref=unifiedModels().find(m=>/ollama:/i.test(m)&&/qwen|llama|gemma/i.test(m))||unifiedModels().find(m=>/ollama:/i.test(m))||unifiedModels()[0];
  fill('mainModel', mainPref); fill('translatorModel', trPref);
}
// One call for both worlds. tagged = "api:model" | "ollama:model"
async function callModel(tagged, messages){
  const i=tagged.indexOf(':'); const kind=tagged.slice(0,i), model=tagged.slice(i+1);
  if(kind==='ollama'){
    if(!await askPermission('ollama_local')) throw new Error('دسترسی Ollama داده نشد');
    const r=await fetch(ollamaBase()+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model, messages, stream:false})});
    const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Ollama HTTP '+r.status);
    return {text:j.message?.content||'', tokens:j.eval_count||0};
  }
  const k=activeKey(); if(!k) throw new Error('کلید API فعال نیست — تب کلیدها');
  if(!await askPermission('api_external')) throw new Error('دسترسی API خارجی داده نشد');
  const r=await fetchWithTimeout(k.base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+k.key,'Content-Type':'application/json'},
    body:JSON.stringify({model, messages, temperature:0.3})});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error?.message||'API HTTP '+r.status);
  return {text:j.choices?.[0]?.message?.content||'', tokens:j.usage?.total_tokens||0};
}
// ===== Module: Internet Search (via Ubuntu service /search) =====
async function internetSearch(q){
  if(!await askPermission('internet_search')) throw new Error('دسترسی جستجوی اینترنت داده نشد');
  const a=act('search','جستجو: '+q,'running');
  try{ const r=await fetch(ehBase()+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,count:5})});
    const j=await r.json(); if(!r.ok) throw new Error(j.detail||r.status);
    act('search','جستجو: '+q,'done',j.results.map(x=>x.title).join(' | ')); return j.results;
  }catch(e){ act('search','جستجو: '+q,'error',e.message); throw e; }
}
