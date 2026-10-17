// ===== Module: Brain-seeded playbooks =====
// The brain decomposes routine tasks ONCE into draft skills. Eye/Hand stay pure
// algorithms (parser + executor + stored steps) — no small brain inside them.
// Runtime: match skill -> execute pieces with checkpoints -> only exceptions go back to the brain.
async function generateSeedSkills(){
  if(state.emergency) return toast('🛑 Emergency Stop فعال است');
  const tasks=$('seedTasks').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(!tasks.length) return toast('اول کارهای عرفی را بنویسید');
  const model=$('mainModel')?.value||unifiedModels()[0];
  if(!model) return toast('مدل اصلی (مغز) انتخاب نشده — تب ایجنت');
  $('seedStatus').textContent='⏳ مغز در حال خردکردن '+tasks.length+' کار به تکه‌های اجرایی…';
  act('agent','🌱 مغز: ساخت پلی‌بوک اولیه','running',tasks.join(' | '));
  const sys=`You decompose routine computer tasks into small executable pieces for a shortcut-first agent.
Return ONLY valid JSON array. Each item: {"name":"...","urlPattern":"/part-of-url-or-empty","goal":"...","steps":[{"type":"key","value":"ctrl+l"},{"type":"type","value":"text"},{"type":"sleep","value":"800"}]}
Rules: prefer shortcuts. Allowed keys ONLY: ${SHORTCUTS.map(x=>x[0]).join(', ')}, plus letters/digits with ctrl/alt/shift combos (e.g. ctrl+1).
Keep each task to at most 8 steps. Do NOT invent passwords or secrets — use placeholder text like <USERNAME>.`;
  try{
    const r=await callModel(model,[{role:'system',content:sys},{role:'user',content:'Tasks:\n'+tasks.map((t,i)=>(i+1)+'. '+t).join('\n')}]);
    const m=r.text.match(/\[[\s\S]*\]/); if(!m) throw new Error('خروجی مغز JSON نبود — دوباره تلاش کنید');
    const drafts=JSON.parse(m[0]); let made=0, rejected=0;
    for(const d of drafts){
      const steps=(d.steps||[]).filter(st=>{
        if(st.type==='key') return ACTION_WHITELIST.has(String(st.value).toLowerCase()) || /^[a-z0-9]$/i.test(st.value) || /^(ctrl|alt|shift)\+[a-z0-9]+$/i.test(st.value);
        return st.type==='type'||st.type==='sleep'; }).slice(0,12);
      if(!steps.length){ rejected++; continue; }
      state.skills.push({id:'sk'+Date.now()+made, name:'🌱 '+(d.name||tasks[made]||'کار عرفی'),
        signature:'', urlPattern:d.urlPattern||'', goal:d.goal||'', actions:steps.filter(x=>x.type!=='sleep'),
        uses:0, successes:0, failures:0, enabled:false, draft:true, source:'brain-seeded', created:Date.now()});
      made++;
    }
    save(); renderMemory();
    $('seedStatus').textContent='✅ '+made+' پیش‌نویس ساخته شد'+(rejected?' ('+rejected+' کار به‌علت قدم نامعتبر رد شد)':'')+' — از فهرست مهارت‌ها هر کدام را «تأیید و فعال» کنید.';
    act('agent','🌱 پلی‌بوک اولیه ساخته شد','done',made+' پیش‌نویس در انتظار تأیید شما');
  }catch(e){ $('seedStatus').textContent='❌ '+e.message; act('agent','🌱 ساخت پلی‌بوک','error',e.message); }
}
// Draft approval lives in the skills list — patch renderMemory to surface drafts
const _renderMemory = renderMemory;
renderMemory = function(){
  _renderMemory();
  document.querySelectorAll('#skillsList .card').forEach((card,i)=>{
    const s=state.skills[i]; if(!s) return;
    if(s.draft){
      card.style.borderColor='#f59e0b';
      const row=document.createElement('div'); row.className='row'; row.style.marginTop='8px';
      row.innerHTML='<span class="pill warn">پیش‌نویس مغز — فعال نیست</span>';
      const b=document.createElement('button'); b.className='btn primary'; b.textContent='✅ تأیید و فعال‌سازی';
      b.onclick=()=>{ s.draft=false; s.enabled=true; s.successes=Math.max(1,s.successes); save(); renderMemory();
        act('agent','مهارت اولیه تأیید شد','done',s.name); toast('فعال شد: '+s.name); };
      row.appendChild(b); card.appendChild(row);
    }
    if(s.source) card.insertAdjacentHTML('beforeend','<div><small class="muted">منبع: '+(s.source==='brain-seeded'?'🌱 خردشده توسط مغز':s.source==='taught-by-user'?'🎓 آموزش شما':'تجربه اجرایی')+'</small></div>');
  });
};
renderMemory();
