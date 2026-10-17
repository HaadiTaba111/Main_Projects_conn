// ===== Module: Agent — translator between user (FA) and reasoner (e.g. DeepSeek R1) =====
const isFA = t => /[\u0600-\u06FF]/.test(t);
async function translate(text, to, model){
  const sys = to==='en'
    ? 'Translate the following Persian text to clear English. Output ONLY the translation.'
    : 'Translate the following English text to natural Persian. Output ONLY the translation.';
  const r=await callModel(model,[{role:'system',content:sys},{role:'user',content:text}]);
  return r.text.trim();
}
async function runAgent(){
  if(state.emergency) return toast('🛑 Emergency Stop فعال است');
  const q=$('agentInput').value.trim(); if(!q) return toast('اول سؤال را بنویسید');
  const main=$('mainModel').value, tr=$('translatorModel').value; if(!main) return toast('مدل اصلی انتخاب نشده');
  $('agentRunBtn').disabled=true;
  ['stageT1','stageMain','stageFinal'].forEach(id=>$(id).textContent='⏳ در صف…'); $('agentSearchResults').innerHTML='';
  try{
    // 1) Translator IN (module + permission gated)
    let prompt=q; const needTr = $('translateMode').value==='always' || ($('translateMode').value==='auto' && isFA(q));
    if(needTr){
      if(state.modules.translator===false) throw new Error('ماژول مترجم خاموش است — تب ماژول‌ها');
      if(!await askPermission('translator')) throw new Error('دسترسی مترجم داده نشد');
      act('translator','ترجمه سؤال فارسی → انگلیسی','running','مدل: '+tr);
      prompt=await translate(q,'en',tr); $('stageT1').textContent=prompt;
      act('translator','ترجمه ورودی تمام شد','done',prompt.slice(0,200));
    } else $('stageT1').textContent='(ترجمه لازم نبود) '+q;
    // 2) Optional internet search
    let ctx='';
    if($('agentSearch').checked){
      const res=await internetSearch(prompt);
      ctx='\n\nWeb search results:\n'+res.map((x,i)=>`[${i+1}] ${x.title}\n${x.snippet}\n${x.url}`).join('\n');
      $('agentSearchResults').innerHTML='<div class="card"><b>🌐 نتایج جستجو</b>'+res.map(x=>`<p class="muted"><a href="${esc(x.url)}" target="_blank" style="color:#7dd3fc">${esc(x.title)}</a><br>${esc(x.snippet)}</p>`).join('')+'</div>';
    }
    // 3) Main model
    act('agent','مدل اصلی در حال فکرکردن','running','مدل: '+main);
    const ans=await callModel(main,[{role:'user',content:prompt+ctx}]);
    $('stageMain').textContent=ans.text;
    act('agent','پاسخ مدل اصلی رسید','done',ans.tokens?ans.tokens+' توکن':'');
    // 4) Translator OUT
    let final=ans.text;
    if(needTr){ act('translator','ترجمه پاسخ → فارسی','running'); final=await translate(ans.text,'fa',tr); act('translator','ترجمه خروجی تمام شد','done'); }
    $('stageFinal').textContent=final;
    state.history.unshift({id:Date.now(),time:Date.now(),model:main+' (+'+tr+')',q,a:final,tokens:ans.tokens,ms:0}); save();
    act('agent','کار تمام شد ✅','done','پاسخ فارسی آماده است'); toast('✅ پاسخ آماده شد');
  }catch(e){ act('agent','خطا در اجرا','error',e.message); $('stageFinal').textContent='❌ '+e.message; toast('❌ '+e.message); }
  $('agentRunBtn').disabled=false; renderAll();
}
// Hand-Mouse module (gated) — used only when shortcuts are not enough
async function sendMouse(action){
  if(state.modules.mouse===false) return toast('ماژول ماوس خاموش است — تب ماژول‌ها');
  if(!await askPermission('hand_mouse')) return;
  act('hand','ماوس: '+action,'running',$('mouseX').value+','+$('mouseY').value);
  try{ const j=await ehPost('/hand/mouse',{x:+$('mouseX').value,y:+$('mouseY').value,action}); handShow(j); act('hand','ماوس: '+action,'done',JSON.stringify(j)); }
  catch(e){ handShow('❌ '+e.message); act('hand','ماوس: '+action,'error',e.message); }
}
