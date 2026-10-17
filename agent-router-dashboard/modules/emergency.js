// ===== Module: EMERGENCY STOP — the big red key =====
// Stops: in-flight fetches, camera, agent/chain runs, and the Ubuntu hand service (server-side flag).
state.emergency ??= false;
let runEpoch = 0;                       // bumped on STOP; running loops check it and bail out
const activeCtrls = new Set();
const _fetch = window.fetch.bind(window);
window.fetch = (url, opts={}) => {
  if (state.emergency && !String(url).includes('/emergency/'))
    return Promise.reject(new Error('🛑 EMERGENCY STOP فعال است'));
  const c = new AbortController();
  if (opts.signal) opts.signal.addEventListener('abort', ()=>c.abort());
  activeCtrls.add(c);
  return _fetch(url, {...opts, signal:c.signal}).finally(()=>activeCtrls.delete(c));
};
const emergencyActive = () => state.emergency;
const checkEpoch = e => { if (state.emergency || e!==runEpoch) throw new Error('🛑 با Emergency Stop متوقف شد'); };

function renderEmergency(){
  let b=$('emergencyBtn');
  if(!b){ b=document.createElement('button'); b.id='emergencyBtn';
    b.style.cssText='position:fixed;bottom:22px;right:22px;z-index:999;background:#dc2626;color:#fff;border:3px solid #fecaca;border-radius:16px;padding:16px 22px;font-size:18px;font-weight:900;box-shadow:0 12px 40px #dc262699;cursor:pointer';
    b.onclick=emergencyStop; document.body.appendChild(b); }
  b.textContent = state.emergency ? '🛑 STOP فعال — برای ادامه کلیک کنید' : '🛑 STOP اضطراری';
  b.style.background = state.emergency ? '#7f1d1d' : '#dc2626';
  let p=$('agentLiveStatus'); if(p && state.emergency){ p.textContent='🛑 EMERGENCY STOP — همه‌چیز متوقف است'; p.className='pill bad'; }
}
async function emergencyStop(){
  if(state.emergency){ // resume path — deliberate, with confirm
    if(!confirm('از حالت توقف اضطراری خارج شود؟ دست و ایجنت دوباره اجازه کار می‌گیرند (طبق دسترسی‌ها).')) return;
    state.emergency=false; save(); renderEmergency();
    try{ await _fetch(ehBase()+'/emergency/resume',{method:'POST'}); }catch{}
    act('permission','🟢 خروج از Emergency Stop','done','کاربر اجازه ادامه داد'); renderActivities(); return;
  }
  state.emergency=true; runEpoch++; save();
  activeCtrls.forEach(c=>{ try{c.abort()}catch{} }); activeCtrls.clear();
  try{ stopCamera(); }catch{}
  const send=$('sendBtn'), run=$('agentRunBtn'); if(send) send.disabled=false; if(run) run.disabled=false;
  const st=$('stopBtn'); if(st) st.disabled=true;
  try{ await _fetch(ehBase()+'/emergency/stop',{method:'POST'}); }catch{}  // Ubuntu hand refuses commands until resume
  renderEmergency(); act('permission','🛑 EMERGENCY STOP','error','همه درخواست‌ها، دوربین و دست اوبونتو متوقف شدند');
  toast('🛑 همه‌چیز متوقف شد'); renderActivities();
}
document.addEventListener('keydown', e=>{ if(e.ctrlKey && e.shiftKey && (e.key==='E'||e.key==='e')){ e.preventDefault(); emergencyStop(); } });
renderEmergency();
