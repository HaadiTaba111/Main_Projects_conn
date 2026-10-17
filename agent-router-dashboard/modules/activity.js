// ===== Module: Live Activity Monitor (see what the agent is doing, now) =====
function act(module, step, status, detail=''){
  state.activities ??= [];
  const a={id:Date.now()+Math.random(), time:Date.now(), module, step, status, detail:String(detail).slice(0,600)};
  state.activities.unshift(a); state.activities=state.activities.slice(0,300); save(); renderActivities(); return a;
}
function renderActivities(){
  const list=$('activityList'); if(!list) return;
  const f=($('actFilter')?.value||''); const items=(state.activities||[]).filter(a=>!f||a.module===f);
  const running=(state.activities||[]).find(a=>a.status==='running');
  const pill=$('agentLiveStatus');
  if(pill){ pill.textContent = running ? '🟢 ایجنت در حال کار: '+running.step+'…' : 'ایجنت: بیکار';
           pill.className='pill '+(running?'ok':'warn'); }
  const sum=$('actSummary'); if(sum) sum.textContent=(state.activities||[]).length+' رویداد ثبت‌شده';
  const icon={running:'⏳',done:'✅',error:'❌',wait:'🔐'};
  list.innerHTML = items.length ? items.slice(0,80).map(a=>`
    <div style="background:#0b1220;border:1px solid var(--line);border-radius:12px;padding:10px 12px">
      <b>${icon[a.status]||'•'} [${esc(a.module)}] ${esc(a.step)}</b>
      <span class="muted">${new Date(a.time).toLocaleTimeString('fa-IR')}</span>
      ${a.detail?`<div class="muted" style="white-space:pre-wrap">${esc(a.detail)}</div>`:''}</div>`).join('')
    : '<p class="muted">هنوز فعالیتی نیست — از تب ایجنت یک اجرا بگیرید.</p>';
}
function clearActivities(){ state.activities=[]; save(); renderActivities(); }
setInterval(renderActivities, 3000);
