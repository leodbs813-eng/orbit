/* =========================================================
   Orbit — Circle-based Study Management
   ========================================================= */
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const pad=n=>String(n).padStart(2,'0');
const clone=o=>JSON.parse(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dk=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pdk=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const todayK=()=>dk(new Date());
const addDays=(k,n)=>{const d=pdk(k);d.setDate(d.getDate()+n);return dk(d)};
const DOW=['일','월','화','수','목','금','토'];
const DOWE=['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MON_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const tToMin=t=>{if(!t)return 0;const[h,m]=t.split(':').map(Number);return h*60+(m||0)};
function fmtDur(ms){const m=Math.round(ms/60000);const h=Math.floor(m/60),mm=m%60;if(h&&mm)return `${h}h ${pad(mm)}m`;if(h)return `${h}h`;return `${mm}m`}
function fmtMin(min){return fmtDur(min*60000)}
function fmtHM(ms){const m=Math.floor(ms/60000);return `${Math.floor(m/60)}:${pad(m%60)}`}
function fmtClock(ms){const s=Math.max(0,Math.floor(ms/1000));return `${pad(Math.floor(s/3600))}:${pad(Math.floor(s/60)%60)}:${pad(s%60)}`}
function fmtDate(k){const d=pdk(k);return `${d.getMonth()+1}.${pad(d.getDate())}`}
function hhmm(ms){const d=new Date(ms);return `${pad(d.getHours())}:${pad(d.getMinutes())}`}

const PALETTE=['#2F6690','#C8553D','#7FA087','#D4A03F','#6D597A','#3E7C6B','#B5838D','#4A5A7A','#A86A3D','#8C9A5B','#5B8DB8','#9C6B98'];
const EVT={exam:{n:'시험',c:'#C8553D'},perf:{n:'수행평가',c:'#D4A03F'},hw:{n:'과제 마감',c:'#2F6690'},personal:{n:'개인 일정',c:'#7FA087'},goal:{n:'장기 목표',c:'#6D597A'}};

/* ---------------- state ---------------- */
function defaultCore(){return{v:1,subjects:[
  {id:'s1',name:'수학',color:'#2F6690'},{id:'s2',name:'영어',color:'#C8553D'},
  {id:'s3',name:'국어',color:'#7FA087'},{id:'s4',name:'과학',color:'#D4A03F'}],
  plans:{},templates:[],events:[],settings:{theme:'auto',goalMin:360},timer:null,updated:0}}
function normalize(o){
  const c=Object.assign(defaultCore(),o&&o.core||{});
  c.settings=Object.assign({theme:'auto',goalMin:360},c.settings||{});
  ['subjects','templates','events'].forEach(k=>{if(!Array.isArray(c[k]))c[k]=[]});
  if(!c.plans||typeof c.plans!=='object')c.plans={};
  const months={};Object.entries(o&&o.months||{}).forEach(([m,v])=>{months[m]={sessions:Array.isArray(v&&v.sessions)?v.sessions:[]}});
  return{core:c,months};
}
let S={core:defaultCore(),months:{}};
let UI={view:'home',calMonth:todayK().slice(0,7),planDate:todayK(),planTab:'day',tplDraft:null,lastDay:todayK()};

/* ---------------- persistence ---------------- */
const LS='orbit-study-v1';
function loadLocal(){try{const r=localStorage.getItem(LS);if(r){const o=JSON.parse(r);if(o&&o.core)S=normalize(o)}}catch(e){}}
function saveLocal(){try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){toast('저장 공간이 부족해요. 백업 후 오래된 기록을 정리하세요.')}}
function commit(){S.core.updated=Date.now();saveLocal()}

/* ---------------- selectors ---------------- */
const subj=id=>S.core.subjects.find(s=>s.id===id);
const subColor=id=>(subj(id)||{}).color||'#8A867D';
const subName=id=>(subj(id)||{}).name||'삭제된 과목';
const activeSubs=()=>S.core.subjects.filter(s=>!s.archived);
function timerElapsed(){const t=S.core.timer;if(!t)return 0;return t.acc+(t.paused?0:Date.now()-t.since)}
function daySessions(k){const m=S.months[k.slice(0,7)];return m?m.sessions.filter(s=>s.d===k).sort((a,b)=>a.start-b.start):[]}
function dayAgg(k,live=true){
  const ss=daySessions(k);const by={},order=[];let total=0;
  ss.forEach(s=>{by[s.sub]=(by[s.sub]||0)+s.dur;total+=s.dur;if(!order.includes(s.sub))order.push(s.sub)});
  let liveMs=0;const t=S.core.timer;
  if(live&&t&&k===todayK()){liveMs=timerElapsed();by[t.subjectId]=(by[t.subjectId]||0)+liveMs;total+=liveMs;if(!order.includes(t.subjectId))order.push(t.subjectId)}
  return{sessions:ss,by,order,total,count:ss.length+(t&&liveMs>0&&k===todayK()?1:0)};
}
function tplMatches(t,k){
  const r=t.repeat||{type:'none'};const dow=pdk(k).getDay();
  if(r.type==='daily')return true;
  if(r.type==='weekdays')return dow>=1&&dow<=5;
  if(r.type==='dow')return(r.dows||[]).includes(dow);
  if(r.type==='interval'){if(!r.from)return false;const diff=Math.round((pdk(k)-pdk(r.from))/864e5);return diff>=0&&diff%Math.max(1,r.every||1)===0}
  return false;
}
function planFromTpl(t){
  const items=[],map={};
  (t.blocks||[]).slice().sort((a,b)=>tToMin(a.start)-tToMin(b.start)).forEach(b=>{
    (b.items||[]).slice().sort((x,y)=>tToMin(x.start)-tToMin(y.start)).forEach(it=>{
      if(!it.subjectId)return;const dur=Math.max(0,tToMin(it.end)-tToMin(it.start));
      if(!map[it.subjectId]){map[it.subjectId]={subjectId:it.subjectId,min:0,note:''};items.push(map[it.subjectId])}
      map[it.subjectId].min+=dur;
    });
  });
  return{goal:0,items,tplId:t.id,tplName:t.name,blocks:clone(t.blocks||[])};
}
function planFor(k){
  const p=S.core.plans[k];if(p)return p;
  const t=S.core.templates.find(t=>t.active!==false&&tplMatches(t,k));
  if(t)return Object.assign(planFromTpl(t),{derived:true});
  return null;
}
const planSum=p=>p?(p.items||[]).reduce((a,i)=>a+(+i.min||0),0):0;
function targetMin(k){const p=planFor(k);if(p&&(p.goal||planSum(p)))return p.goal||planSum(p);return S.core.settings.goalMin||0}
function hasPlan(k){const p=planFor(k);return !!(p&&planSum(p)>0)}
function ensurePlan(k){
  if(!S.core.plans[k]){const p=planFor(k);S.core.plans[k]=p?clone(p):{goal:0,items:[]};delete S.core.plans[k].derived}
  return S.core.plans[k];
}
function allSessions(){return Object.values(S.months).flatMap(m=>m.sessions)}

/* ---------------- timer actions ---------------- */
function startTimer(sid){
  if(S.core.timer)stopTimer(true);
  const now=Date.now();S.core.timer={subjectId:sid,startedAt:now,since:now,acc:0,paused:false,segs:[]};
  commit();toast(`${subName(sid)} 시작`);
}
function pauseTimer(){const t=S.core.timer;if(!t||t.paused)return;const now=Date.now();t.segs.push([t.since,now]);t.acc+=now-t.since;t.paused=true;commit()}
function resumeTimer(){const t=S.core.timer;if(!t||!t.paused)return;t.since=Date.now();t.paused=false;commit()}
function stopTimer(silent){
  const t=S.core.timer;if(!t)return;const now=Date.now();
  const segs=t.segs.slice();if(!t.paused)segs.push([t.since,now]);
  S.core.timer=null;
  const valid=segs.filter(s=>s[1]-s[0]>=1000);const tot=valid.reduce((a,s)=>a+s[1]-s[0],0);
  if(tot<60000){commit();if(!silent)toast('1분 미만은 기록되지 않아요');return}
  const months=addSessionFromSegs(t.subjectId,valid);commit(months);
  if(!silent)toast(`${subName(t.subjectId)} ${fmtDur(tot)} 기록됨`);
}
function addSessionFromSegs(sub,segs){
  const groups={};
  segs.forEach(([a,b])=>{let s=a;while(s<b){const d=new Date(s);const mid=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime();const e=Math.min(b,mid);const k=dk(d);(groups[k]=groups[k]||[]).push([s,e]);s=e}});
  const months=new Set();
  Object.entries(groups).forEach(([k,gs])=>{
    const dur=gs.reduce((a,s)=>a+s[1]-s[0],0);if(dur<1000)return;
    const m=k.slice(0,7);(S.months[m]=S.months[m]||{sessions:[]}).sessions.push({id:uid(),d:k,sub,start:gs[0][0],end:gs[gs.length-1][1],dur,segs:gs});months.add(m);
  });
  return[...months];
}

/* ---------------- ring system ---------------- */
function polar(r,a){const rad=(a-90)*Math.PI/180;return[100+r*Math.cos(rad),100+r*Math.sin(rad)]}
function arcPath(r,a0,a1){
  if(a1-a0>=359.99)return arcPath(r,a0,a0+180)+' '+arcPath(r,a0+180,a0+359.98);
  const[x0,y0]=polar(r,a0),[x1,y1]=polar(r,a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
/* One ring, three roles. plan → tracks; actual → solid fill inside each planned segment;
   surplus (over-plan or unplanned subjects) → outer orbit. */
function ringSVG({plan,agg,goalMin,mini=false,ticks=!mini,live=null,animate=false,planOnly=false,secHand=false}){
  const w=mini?17:13,r=mini?70:78,oR=r+w/2+(mini?8:8),oW=mini?6:3.2;
  const parts=[],orbit=[];let scale;
  const items=plan?(plan.items||[]).filter(i=>+i.min>0):[];
  if(items.length){
    scale=items.reduce((a,i)=>a+(+i.min),0);
    const gap=items.length>1?(mini?4:1.4):0;let acc=0;const planned=new Set();
    items.forEach(it=>{
      const a0=acc/scale*360,a1=(acc+(+it.min))/scale*360;acc+=+it.min;
      const s0=a0+gap/2,s1=Math.max(s0+.2,a1-gap/2),col=subColor(it.subjectId);
      parts.push({r,w,a0:s0,a1:s1,col,op:mini?.22:.2});
      planned.add(it.subjectId);
      const act=agg&&!planOnly?(agg.by[it.subjectId]||0)/60000:0;
      if(act>0){const f=Math.min(1,act/it.min);parts.push({r,w,a0:s0,a1:s0+(s1-s0)*f,col,op:1,sub:it.subjectId,solid:1});if(act>it.min)orbit.push({sub:it.subjectId,min:act-it.min})}
    });
    if(agg&&!planOnly)agg.order.forEach(sid=>{if(!planned.has(sid)&&agg.by[sid]>0)orbit.push({sub:sid,min:agg.by[sid]/60000})});
  }else{
    scale=goalMin||360;
    parts.push({r,w,a0:0,a1:360,col:'var(--ink)',op:mini?.09:.075});
    let acc=0;
    if(agg&&!planOnly)agg.order.forEach(sid=>{
      const m=agg.by[sid]/60000;const e=Math.min(scale,acc+m);
      if(e>acc)parts.push({r,w,a0:acc/scale*360,a1:e/scale*360,col:subColor(sid),op:1,sub:sid,solid:1});
      if(acc+m>scale)orbit.push({sub:sid,min:acc+m-Math.max(scale,acc)});acc+=m;
    });
  }
  let oacc=0;const oparts=[];
  orbit.forEach(o=>{const a0=oacc/scale*360;oacc+=o.min;const a1=Math.min(359.9,oacc/scale*360);if(a1>a0+.05)oparts.push({r:oR,w:oW,a0,a1,col:subColor(o.sub),op:1,sub:o.sub,solid:1})});
  let s='';
  // ticks
  if(ticks){
    const hours=scale/60;const step=hours<=8?30:hours<=16?60:120;const n=Math.round(scale/step);
    const ri=r-w/2-5;
    for(let i=0;i<n;i++){const a=i/n*360;const major=(i*step)%60===0;const[x0,y0]=polar(ri,a),[x1,y1]=polar(ri-(major?5:2.5),a);
      s+=`<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" style="stroke:var(--ink3);stroke-width:${major?.7:.45}" ${animate?'class="fade"':''}/>`}
  }
  if(oparts.length&&!mini)s+=`<circle cx="100" cy="100" r="${oR}" style="fill:none;stroke:var(--line);stroke-width:.5;stroke-dasharray:1 2.2"/>`;
  let i=0;
  [...parts,...oparts].forEach(p=>{
    const anim=animate&&p.solid?` class="draw" pathLength="1" style="animation-delay:${(.15+i++*.08).toFixed(2)}s;`:` style="`;
    s+=`<path d="${arcPath(p.r,p.a0,p.a1)}"${anim}fill:none;stroke:${p.col};stroke-opacity:${p.op};stroke-width:${p.w}"/>`;
  });
  if(live){
    const cand=[...oparts].reverse().find(p=>p.sub===live)||[...parts].reverse().find(p=>p.sub===live&&p.solid);
    if(cand){const[x,y]=polar(cand.r,cand.a1);s+=`<circle class="tip" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${cand===oparts.find(p=>p===cand)?2.4:3.2}" style="fill:var(--paper);stroke:${subColor(live)};stroke-width:1.6"/>`}
  }
  if(secHand){const sec=(Date.now()/1000)%60;const rr=r-w/2-16;s+=`<circle cx="100" cy="100" r="${rr}" style="fill:none;stroke:var(--line2);stroke-width:.6"/><g class="sechand" style="animation-delay:-${sec.toFixed(2)}s"><circle cx="100" cy="${100-rr}" r="1.6" style="fill:var(--ink)"/></g>`}
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${s}</svg>`;
}
function ringBlock(opts,center,maxW){return `<div class="ringwrap" style="max-width:${maxW||360}px">${ringSVG(opts)}<div class="ringc">${center||''}</div></div>`}

/* 24h dial for timetables */
function dialSVG(blocks,size){
  let s=`<circle cx="100" cy="100" r="80" style="fill:none;stroke:var(--track);stroke-width:14"/>`;
  for(let h=0;h<24;h++){const a=h/24*360;const[x0,y0]=polar(64,a),[x1,y1]=polar(h%6===0?57:61,a);s+=`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:var(--ink3);stroke-width:${h%6===0?1:.5}"/>`}
  ;[0,6,12,18].forEach(h=>{const[x,y]=polar(46,h/24*360);s+=`<text x="${x}" y="${y+3}" text-anchor="middle" style="font-size:9px;fill:var(--ink3);font-family:Inter Tight">${h}</text>`});
  (blocks||[]).forEach(b=>{
    const a0=tToMin(b.start)/1440*360,a1=tToMin(b.end)/1440*360;if(a1>a0)s+=`<path d="${arcPath(94,a0,a1)}" style="fill:none;stroke:var(--ink);stroke-width:2"/>`;
    (b.items||[]).forEach(it=>{const x0=tToMin(it.start)/1440*360,x1=tToMin(it.end)/1440*360;if(x1>x0)s+=`<path d="${arcPath(80,x0,x1)}" style="fill:none;stroke:${subColor(it.subjectId)};stroke-width:14"/>`});
  });
  return `<svg viewBox="0 0 200 200" style="width:${size||96}px;height:${size||96}px;display:block">${s}</svg>`;
}

/* ---------------- UI helpers ---------------- */
let toastT;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200)}
let sheetClose=null;
function openSheet(html,onMount){
  closeSheet(true);
  const sc=document.createElement('div');sc.className='scrim';sc.id='scrim';
  const sh=document.createElement('div');sh.className='sheet';sh.id='sheet';sh.innerHTML=`<div class="grab"></div>${html}`;
  document.body.append(sc,sh);sc.onclick=()=>closeSheet();
  requestAnimationFrame(()=>{sc.classList.add('show');sh.classList.add('show')});
  onMount&&onMount(sh);
}
function closeSheet(instant){
  const sc=$('#scrim'),sh=$('#sheet');if(!sh)return;
  sc.id='';sh.id='';
  if(instant){sc.remove();sh.remove();return}
  sc.classList.remove('show');sh.classList.remove('show');setTimeout(()=>{sc.remove();sh.remove()},320);
  sheetClose&&sheetClose();sheetClose=null;
}
function confirmBox(msg,okText='확인',danger=true){
  return new Promise(res=>{
    const back=$('#sheet')?$('#sheet').innerHTML:null;
    const box=document.createElement('div');box.className='scrim show';box.style.zIndex=90;box.style.display='flex';box.style.alignItems='center';box.style.justifyContent='center';
    box.innerHTML=`<div style="background:var(--paper);padding:24px;max-width:340px;width:86%;border-radius:6px;box-shadow:var(--shadow)"><p style="margin-bottom:20px;line-height:1.6">${esc(msg)}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost sm" data-x="0">취소</button><button class="btn sm ${danger?'danger':'solid'}" data-x="1">${esc(okText)}</button></div></div>`;
    box.onclick=e=>{const b=e.target.closest('[data-x]');if(b||e.target===box){box.remove();res(!!(b&&b.dataset.x==='1'))}};
    document.body.append(box);
  });
}
function applyTheme(){
  const t=S.core.settings.theme;const dark=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',applyTheme);
const swatch=c=>`<i class="sw" style="background:${c}"></i>`;
function subOptions(sel,includeEmpty){return (includeEmpty?`<option value="">과목 선택</option>`:'')+S.core.subjects.filter(s=>!s.archived||s.id===sel).map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${esc(s.name)}</option>`).join('')}
function hmInputs(min,attr){const h=Math.floor((+min||0)/60),m=(+min||0)%60;return `<span class="hm"><input class="in n num" type="number" min="0" max="23" inputmode="numeric" value="${h}" ${attr} data-part="h"> h <input class="in n num" type="number" min="0" max="59" step="5" inputmode="numeric" value="${m}" ${attr} data-part="m"> m</span>`}
function readHM(el){const wrap=el.closest('.hm');const h=+$('[data-part=h]',wrap).value||0,m=+$('[data-part=m]',wrap).value||0;return Math.max(0,h*60+m)}
function dday(k){const n=Math.round((pdk(k)-pdk(todayK()))/864e5);return n===0?'D-DAY':n>0?`D-${n}`:`D+${-n}`}

/* ---------------- navigation ---------------- */
const NAV=[['home','오늘'],['calendar','달력'],['stats','통계'],['plan','계획'],['prefs','설정']];
const BRAND=`<div class="brand"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".25"/><path d="M12 3a9 9 0 0 1 8.2 12.7" fill="none" stroke="#C8553D" stroke-width="2.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>Orbit</div>`;
function renderNav(){
  const live=S.core.timer&&!S.core.timer.paused;
  const items=NAV.map(([v,n])=>`<button class="nv ${UI.view===v?'on':''}" data-act="go" data-v="${v}"><span class="dot"></span>${n}${v==='home'&&live?'<span class="live"></span>':''}</button>`).join('');
  $('#botNav').innerHTML=items;$('#sideNav').innerHTML=BRAND+items;
}
function go(v){const changed=UI.view!==v;UI.view=v;render(true);if(changed)scrollTo(0,0);try{if(location.hash.slice(1)!==v)location.hash=v}catch(e){}}
const VIEWS=NAV.map(n=>n[0]);
function route(){const h=location.hash.slice(1);const v=VIEWS.includes(h)?h:'home';if(v!==UI.view){UI.view=v;render(true);scrollTo(0,0)}}
window.addEventListener('hashchange',route);
function render(anim){
  renderNav();
  const f={home:vHome,calendar:vCalendar,stats:vStats,plan:vPlan,prefs:vPrefs}[UI.view]||vHome;
  $('#main').innerHTML=f(anim);
}

/* ================= HOME ================= */
function homeRing(anim){
  const k=todayK(),p=planFor(k),agg=dayAgg(k),tgt=targetMin(k),t=S.core.timer;
  const pct=tgt?Math.round(agg.total/60000/tgt*100):0;
  let center;
  if(t){
    const it=hasPlan(k)?p.items.find(i=>i.subjectId===t.subjectId):null;
    center=`<div class="subj">${swatch(subColor(t.subjectId))}${esc(subName(t.subjectId))}${t.paused?' <span class="muted" style="font-weight:400">· 일시정지</span>':''}</div><div class="clock num">${fmtClock(timerElapsed())}</div><div class="small">과목 <b class="num">${fmtHM(agg.by[t.subjectId]||0)}</b>${it?` / <span class="num">${fmtHM(it.min*60000)}</span>`:''} · 오늘 <span class="num">${fmtHM(agg.total)}</span></div>`;
  }else{
    center=`<div class="lbl">오늘 공부</div><div class="big num">${fmtHM(agg.total)}</div><div class="small">목표 <span class="num">${fmtHM(tgt*60000)}</span> · <b class="num">${pct}%</b></div>`;
  }
  return ringBlock({plan:hasPlan(k)?p:null,agg,goalMin:tgt,live:t&&!t.paused?t.subjectId:null,animate:anim,secHand:!!(t&&!t.paused)},center,400);
}
function homeCtl(){
  const t=S.core.timer;
  if(t)return `<div class="timer-ctl">
    <div class="side"><button class="btn round ghost" data-act="switchSub" title="과목 변경">⇄</button>과목 변경</div>
    <div class="side">${t.paused?`<button class="btn round lg solid" data-act="resume">▶</button>재개`:`<button class="btn round lg solid" data-act="pause">❙❙</button>일시정지`}</div>
    <div class="side"><button class="btn round ghost" data-act="stop">■</button>종료</div></div>`;
  const k=todayK(),p=planFor(k);
  const order=hasPlan(k)?p.items.map(i=>i.subjectId).filter(id=>subj(id)&&!subj(id).archived):[];
  const subs=[...order.map(subj),...activeSubs().filter(s=>!order.includes(s.id))];
  return `<div class="lbl" style="margin:22px 0 12px;text-align:center">과목을 눌러 타이머 시작</div><div class="chips" style="justify-content:center">${subs.map(s=>`<button class="chip" data-act="start" data-id="${s.id}">${swatch(s.color)}${esc(s.name)}</button>`).join('')||'<span class="muted">설정에서 과목을 추가하세요</span>'}</div>`;
}
function homeKpis(){
  const k=todayK(),agg=dayAgg(k),tgt=targetMin(k);const pct=tgt?Math.round(agg.total/60000/tgt*100):0;
  return `<div class="kpis"><div class="kpi"><div class="lbl">총 공부</div><div class="v num">${fmtHM(agg.total)}</div></div><div class="kpi"><div class="lbl">달성률</div><div class="v num">${pct}<small>%</small></div></div><div class="kpi"><div class="lbl">공부 횟수</div><div class="v num">${agg.count}<small>회</small></div></div></div>`;
}
function planList(k){
  const p=planFor(k),agg=dayAgg(k);
  if(!hasPlan(k)){
    const rows=agg.order.map(sid=>`<li class="prow">${swatch(subColor(sid))}<span class="nm">${esc(subName(sid))}</span><span class="vv"><b class="num">${fmtDur(agg.by[sid])}</b></span></li>`).join('');
    return `${rows?`<ul class="plist">${rows}</ul>`:''}<div class="banner" style="margin-top:${rows?14:0}px"><span>오늘의 계획이 아직 없어요. 계획을 세우면 원이 과목별로 나뉩니다.</span><button class="link" data-act="planFor" data-k="${k}">계획 세우기 →</button></div>`;
  }
  const planned=new Set(p.items.map(i=>i.subjectId));
  const rows=p.items.filter(i=>i.min>0).map(it=>{
    const act=agg.by[it.subjectId]||0;const pct=Math.round(act/60000/it.min*100);const w=Math.min(100,pct);
    return `<li class="prow">${swatch(subColor(it.subjectId))}<span class="nm">${esc(subName(it.subjectId))}</span><span class="vv"><b class="num">${fmtHM(act)}</b> / <span class="num">${fmtHM(it.min*60000)}</span> · <span class="num">${pct}%</span></span><div class="bar"><i style="width:${w}%;background:${subColor(it.subjectId)}"></i>${pct>100?`<i style="left:100%;width:${Math.min(40,pct-100)}%;background:${subColor(it.subjectId)};opacity:.4"></i>`:''}</div>${it.note?`<div class="note">${esc(it.note)}</div>`:''}</li>`;
  }).join('');
  const extra=agg.order.filter(s=>!planned.has(s)).map(sid=>`<li class="prow">${swatch(subColor(sid))}<span class="nm">${esc(subName(sid))} <span class="muted" style="font-weight:400;font-size:12px">계획 외</span></span><span class="vv"><b class="num">${fmtHM(agg.by[sid])}</b></span></li>`).join('');
  return `<ul class="plist">${rows}${extra}</ul>`;
}
function scheduleList(k){
  const p=planFor(k);const blocks=(p&&p.blocks||[]).slice().sort((a,b)=>tToMin(a.start)-tToMin(b.start));
  const nowM=new Date().getHours()*60+new Date().getMinutes();const isToday=k===todayK();
  const evs=S.core.events.filter(e=>e.date===k);
  let h='';
  if(blocks.length)h+=`<ul class="sched">${blocks.map(b=>`<li class="${isToday&&nowM>=tToMin(b.start)&&nowM<tToMin(b.end)?'now':''}"><span class="tm num">${b.start}–${b.end}</span><div><div class="bl">${esc(b.label||'타임')}</div><div class="its">${(b.items||[]).map(it=>`<span>${swatch(subColor(it.subjectId))}<span class="num">${it.start}–${it.end}</span> ${esc(subName(it.subjectId))}</span>`).join('')}</div></div></li>`).join('')}</ul>`;
  if(evs.length)h+=evs.map(e=>`<div class="evt" data-act="editEvent" data-k="${e.date}" data-id="${e.id}" style="cursor:pointer"><i class="sq" style="background:${EVT[e.type]?.c||'#888'}"></i><span class="ty">${EVT[e.type]?.n||''}</span><span>${esc(e.title)}</span></div>`).join('');
  return h||`<div class="empty" style="text-align:left;padding:8px 0">등록된 시간표나 일정이 없어요.</div>`;
}
function vHome(anim){
  const k=todayK(),d=new Date();
  const up=S.core.events.filter(e=>e.date>=k).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  return `
  <header class="top"><div><div class="lbl">TODAY · ${DOWE[d.getDay()]}</div><h1 class="num">${d.getMonth()+1}.${pad(d.getDate())}</h1><div class="sub">${d.getFullYear()} · ${DOW[d.getDay()]}요일</div></div></header>
  <div class="grid2">
    <div><div id="hRing">${homeRing(anim)}</div><div id="hCtl">${homeCtl()}</div></div>
    <div class="stack">
      <div id="hKpi">${homeKpis()}</div>
      <div><div class="sec-h" style="margin:14px 0 4px"><h2><span class="idx">01</span>오늘의 계획</h2><button class="link" data-act="planFor" data-k="${k}">편집</button></div><div id="hPlan">${planList(k)}</div></div>
    </div>
  </div>
  <section class="sec mt2"><div class="sec-h"><h2><span class="idx">02</span>오늘의 시간표 · 일정</h2><button class="link" data-act="editEvent" data-k="${k}">+ 일정</button></div>${scheduleList(k)}</section>
  <section class="sec"><div class="sec-h"><h2><span class="idx">03</span>다가오는 일정</h2><button class="link" data-act="go" data-v="calendar">달력 →</button></div>
  ${up.length?up.map(e=>`<div class="evt" data-act="editEvent" data-k="${e.date}" data-id="${e.id}" style="cursor:pointer"><i class="sq" style="background:${EVT[e.type]?.c}"></i><span class="ty num">${fmtDate(e.date)}</span><span>${esc(e.title)}</span><span class="dd num">${dday(e.date)}</span></div>`).join(''):`<div class="empty" style="text-align:left;padding:8px 0">예정된 일정이 없어요.</div>`}</section>`;
}

function openSwitch(){
  const cur=S.core.timer&&S.core.timer.subjectId;
  openSheet(`<div class="sh"><div><div class="lbl">SWITCH</div><h2>과목 변경</h2></div><button class="close" data-act="closeSheet">✕</button></div><p class="muted" style="font-size:12.5px;margin-bottom:14px">지금까지의 공부는 저장되고 새 과목의 타이머가 시작됩니다.</p><div class="chips">${activeSubs().map(s=>`<button class="chip ${s.id===cur?'on':''}" data-act="doSwitch" data-id="${s.id}">${swatch(s.color)}${esc(s.name)}</button>`).join('')}</div>`);
}

/* ================= CALENDAR ================= */
function vCalendar(anim){
  const [y,m]=UI.calMonth.split('-').map(Number);const first=new Date(y,m-1,1);const start=new Date(first);start.setDate(1-first.getDay());
  const tk=todayK();let cells='';let mTotal=0,mDays=0;
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const k=dk(d);const out=d.getMonth()!==m-1;
    if(i>=35&&out&&d.getDay()===0)break;
    const agg=dayAgg(k);const p=planFor(k);const hp=hasPlan(k);const tgt=targetMin(k);
    if(!out&&agg.total>0){mTotal+=agg.total;mDays++}
    const evs=S.core.events.filter(e=>e.date===k).slice(0,3);
    let ring='';
    if(agg.total>0)ring=ringSVG({plan:hp?p:null,agg,goalMin:tgt,mini:true});
    else if(hp&&k>=tk)ring=ringSVG({plan:p,mini:true,planOnly:true});
    else ring=`<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="3" style="fill:var(--line)"/></svg>`;
    const full=agg.total>0&&tgt&&agg.total/60000>=tgt;
    cells+=`<div class="cell ${out?'out':''} ${k===tk?'today':''} ${d.getDay()===0?'sun':''}" data-act="day" data-k="${k}"><span class="dn num">${d.getDate()}</span>${evs.length?`<span class="evs">${evs.map(e=>`<i style="background:${EVT[e.type]?.c}"></i>`).join('')}</span>`:''}<div class="mr" style="position:relative">${ring}${full?`<i style="position:absolute;left:50%;top:50%;width:14%;aspect-ratio:1;border-radius:50%;background:var(--ink);transform:translate(-50%,-50%)"></i>`:''}</div><span class="tt num">${agg.total>0?fmtHM(agg.total):''}</span></div>`;
  }
  return `<div class="cal-h"><div><div class="lbl">CALENDAR · ${y}</div><h1 class="num">${pad(m)}<span style="font-size:18px;letter-spacing:0;margin-left:10px;color:var(--ink3)">${MON_EN[m-1]}</span></h1></div><div class="cal-nav"><button data-act="calNav" data-v="-1">‹</button><button data-act="calNav" data-v="0" style="width:auto;padding:0 12px;font-size:12px;border-radius:999px">오늘</button><button data-act="calNav" data-v="1">›</button></div></div>
  <div class="cal">${DOWE.map(d=>`<div class="dw">${d}</div>`).join('')}${cells}</div>
  <div class="legend"><span><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".25"/><path d="M7 2a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>공부 기록 (원 = 계획, 채움 = 실제)</span><span><i style="width:6px;height:6px;border-radius:50%;background:var(--ink);display:inline-block"></i>목표 달성</span>${Object.values(EVT).map(e=>`<span><i class="sq" style="background:${e.c}"></i>${e.n}</span>`).join('')}</div>
  <div class="kpis mt2"><div class="kpi"><div class="lbl">이달 총 공부</div><div class="v num">${fmtHM(mTotal)}</div></div><div class="kpi"><div class="lbl">공부한 날</div><div class="v num">${mDays}<small>일</small></div></div><div class="kpi"><div class="lbl">하루 평균</div><div class="v num">${fmtHM(mDays?mTotal/mDays:0)}</div></div></div>`;
}
function openDay(k){
  const d=pdk(k),agg=dayAgg(k),p=planFor(k),hp=hasPlan(k),tgt=targetMin(k);
  const pct=tgt?Math.round(agg.total/60000/tgt*100):0;const future=k>todayK();
  const evs=S.core.events.filter(e=>e.date===k);
  const center=`<div class="big num" style="font-size:34px">${fmtHM(agg.total)}</div><div class="small">${hp?'계획 '+fmtHM(planSum(p)*60000):'목표 '+fmtHM(tgt*60000)}</div>`;
  const subRows=(()=>{const ids=[...new Set([...(hp?p.items.map(i=>i.subjectId):[]),...agg.order])];return ids.map(sid=>{const it=hp?p.items.find(i=>i.subjectId===sid):null;const a=agg.by[sid]||0;return `<li class="prow">${swatch(subColor(sid))}<span class="nm">${esc(subName(sid))}</span><span class="vv"><b class="num">${fmtHM(a)}</b>${it?` / <span class="num">${fmtHM(it.min*60000)}</span>`:''}</span></li>`}).join('')})();
  openSheet(`<div class="sh"><div><div class="lbl">${DOWE[d.getDay()]} · ${d.getFullYear()}</div><h2 class="num">${d.getMonth()+1}월 ${d.getDate()}일 <span class="muted" style="font-size:16px">${DOW[d.getDay()]}요일</span></h2></div><button class="close" data-act="closeSheet">✕</button></div>
   <div class="grid2" style="gap:18px">
     <div>${ringBlock({plan:hp?p:null,agg,goalMin:tgt,planOnly:future&&!agg.total,animate:true},center,230)}</div>
     <div>
       <div class="kpis"><div class="kpi"><div class="lbl">총 공부</div><div class="v num" style="font-size:20px">${fmtHM(agg.total)}</div></div><div class="kpi"><div class="lbl">횟수</div><div class="v num" style="font-size:20px">${agg.count}</div></div><div class="kpi"><div class="lbl">달성률</div><div class="v num" style="font-size:20px">${pct}<small>%</small></div></div></div>
       <ul class="plist mt">${subRows||'<div class="empty">기록이 없어요</div>'}</ul>
       <button class="link mt" data-act="planFor" data-k="${k}" style="display:inline-block">${hp?'이 날의 계획 편집 →':'이 날의 계획 세우기 →'}</button>
     </div>
   </div>
   <div class="sec mt"><div class="sec-h"><h2>공부 기록</h2><button class="link" data-act="editSession" data-k="${k}">+ 기록 추가</button></div>
   ${agg.sessions.length?`<ul class="slist">${agg.sessions.map(s=>`<li data-act="editSession" data-k="${k}" data-id="${s.id}">${swatch(subColor(s.sub))}<div><div class="nm">${esc(subName(s.sub))}</div><div class="muted num" style="font-size:12px">${hhmm(s.start)} – ${hhmm(s.end)}</div></div><b class="num" style="font-weight:500">${fmtDur(s.dur)}</b></li>`).join('')}</ul>`:'<div class="empty" style="text-align:left;padding:4px 0">기록이 없어요.</div>'}</div>
   <div class="sec"><div class="sec-h"><h2>일정</h2><button class="link" data-act="editEvent" data-k="${k}">+ 일정 추가</button></div>
   ${evs.length?evs.map(e=>`<div class="evt" data-act="editEvent" data-k="${k}" data-id="${e.id}" style="cursor:pointer"><i class="sq" style="background:${EVT[e.type]?.c}"></i><span class="ty">${EVT[e.type]?.n}</span><span>${esc(e.title)}</span><span class="dd num">${dday(e.date)}</span></div>`).join(''):'<div class="empty" style="text-align:left;padding:4px 0">일정이 없어요.</div>'}</div>`);
}
function openSessionEdit(k,id){
  const s=id?daySessions(k).find(x=>x.id===id):null;
  const now=new Date();const defStart=s?hhmm(s.start):(k===todayK()?`${pad(Math.max(0,now.getHours()-1))}:00`:'19:00');
  openSheet(`<div class="sh"><div><div class="lbl">${fmtDate(k)}</div><h2>${s?'기록 수정':'기록 추가'}</h2></div><button class="close" data-act="closeSheet">✕</button></div>
  <form id="sessForm" class="stack">
    <label class="field"><span>과목</span><select class="in" name="sub">${subOptions(s?s.sub:(activeSubs()[0]||{}).id)}</select></label>
    <div class="fgrid"><label class="field"><span>날짜</span><input class="in num" type="date" name="date" value="${k}"></label><label class="field"><span>시작 시각</span><input class="in num" type="time" name="start" value="${defStart}"></label></div>
    <label class="field"><span>공부 시간</span>${hmInputs(s?Math.round(s.dur/60000):60,'')}</label>
    <div class="row mt2" style="justify-content:space-between">${s?`<button type="button" class="btn danger sm" data-act="delSession" data-k="${k}" data-id="${s.id}">삭제</button>`:'<span></span>'}<div class="row"><button type="button" class="btn ghost" data-act="day" data-k="${k}">취소</button><button class="btn solid" type="submit">저장</button></div></div>
  </form>`,sh=>{
    $('#sessForm',sh).onsubmit=e=>{
      e.preventDefault();const f=e.target;const min=readHM($('[data-part=h]',f));
      if(!f.sub.value){toast('과목을 선택하세요');return}if(min<1){toast('시간을 입력하세요');return}
      const nd=f.date.value||k;const st=pdk(nd);const[hh,mm]=(f.start.value||'00:00').split(':').map(Number);st.setHours(hh,mm,0,0);
      const start=st.getTime(),dur=min*60000;const months=new Set([nd.slice(0,7)]);
      if(s){const om=S.months[k.slice(0,7)];om.sessions=om.sessions.filter(x=>x.id!==s.id);months.add(k.slice(0,7))}
      const mk=nd.slice(0,7);(S.months[mk]=S.months[mk]||{sessions:[]}).sessions.push({id:s?s.id:uid(),d:nd,sub:f.sub.value,start,end:start+dur,dur,segs:[[start,start+dur]],manual:true});
      commit([...months]);toast('저장했어요');render(false);openDay(nd);
    };
  });
}
function openEventEdit(k,id){
  const e=id?S.core.events.find(x=>x.id===id):null;
  openSheet(`<div class="sh"><div><div class="lbl">SCHEDULE</div><h2>${e?'일정 수정':'일정 추가'}</h2></div><button class="close" data-act="closeSheet">✕</button></div>
  <form id="evForm" class="stack">
    <div class="field"><span>종류</span><div class="chips" id="evType">${Object.entries(EVT).map(([t,v])=>`<button type="button" class="chip ${(e?e.type:'exam')===t?'on':''}" data-t="${t}"><i class="sq" style="background:${v.c}"></i>${v.n}</button>`).join('')}</div></div>
    <label class="field"><span>제목</span><input class="in" name="title" value="${esc(e?e.title:'')}" placeholder="예: 2학기 기말고사 수학" required></label>
    <label class="field"><span>날짜</span><input class="in num" type="date" name="date" value="${e?e.date:k}" required></label>
    <label class="field"><span>메모</span><input class="in" name="note" value="${esc(e?e.note||'':'')}" placeholder="범위, 준비물 등"></label>
    <div class="row mt2" style="justify-content:space-between">${e?`<button type="button" class="btn danger sm" data-act="delEvent" data-id="${e.id}">삭제</button>`:'<span></span>'}<div class="row"><button type="button" class="btn ghost" data-act="closeSheet">취소</button><button class="btn solid" type="submit">저장</button></div></div>
  </form>`,sh=>{
    let type=e?e.type:'exam';
    $('#evType',sh).onclick=ev=>{const b=ev.target.closest('[data-t]');if(!b)return;type=b.dataset.t;$$('#evType .chip',sh).forEach(c=>c.classList.toggle('on',c===b))};
    $('#evForm',sh).onsubmit=ev=>{ev.preventDefault();const f=ev.target;const o={id:e?e.id:uid(),type,title:f.title.value.trim(),date:f.date.value,note:f.note.value.trim()};if(!o.title||!o.date)return;
      if(e)Object.assign(e,o);else S.core.events.push(o);commit();closeSheet();render(false);toast('일정을 저장했어요')};
  });
}

/* ================= STATS ================= */
function aggRange(keys){return keys.map(k=>dayAgg(k))}
function lastDays(n,end=todayK()){const a=[];for(let i=n-1;i>=0;i--)a.push(addDays(end,-i));return a}
function stackedBars(days,{h=150,labels}={}){
  const W=320,pb=18,pt=8;const aggs=days.map(k=>dayAgg(k));const max=Math.max(60*60000,...aggs.map(a=>a.total),...days.map(d=>targetMin(d)*60000));
  const bw=W/days.length;let s='';
  const gridH=Math.ceil(max/3600000);const stepH=gridH>8?2:1;
  for(let hh=stepH;hh<=gridH;hh+=stepH){const y=h-pb-(hh*3600000/max)*(h-pb-pt);s+=`<line x1="0" x2="${W}" y1="${y}" y2="${y}" style="stroke:var(--line2);stroke-width:.6"/><text x="${W}" y="${y-2}" text-anchor="end">${hh}h</text>`}
  aggs.forEach((a,i)=>{let y=h-pb;const x=i*bw+bw*.22,w=bw*.56;
    a.order.forEach(sid=>{const bh=a.by[sid]/max*(h-pb-pt);y-=bh;s+=`<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0,bh)}" style="fill:${subColor(sid)}"/>`});
    const tgt=targetMin(days[i]);if(tgt){const ty=h-pb-(tgt*60000/max)*(h-pb-pt);if(ty>pt-2)s+=`<line x1="${x-2}" x2="${x+w+2}" y1="${ty}" y2="${ty}" style="stroke:var(--ink);stroke-width:.8;stroke-dasharray:1.5 1.5"/>`}
    s+=`<text x="${x+w/2}" y="${h-4}" text-anchor="middle" style="${days[i]===todayK()?'fill:var(--ink)':''}">${labels?labels[i]:''}</text>`});
  s+=`<line x1="0" x2="${W}" y1="${h-pb}" y2="${h-pb}" style="stroke:var(--ink);stroke-width:.8"/>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${h}">${s}</svg></div>`;
}
function hourDial(){
  const bins=new Array(24).fill(0);
  allSessions().forEach(s=>(s.segs&&s.segs.length?s.segs:[[s.start,s.start+s.dur]]).forEach(([a,b])=>{let t=a;while(t<b){const d=new Date(t);const next=new Date(d.getFullYear(),d.getMonth(),d.getDate(),d.getHours()+1).getTime();const e=Math.min(b,next);bins[d.getHours()]+=e-t;t=e}}));
  const max=Math.max(1,...bins);const peak=bins.indexOf(Math.max(...bins));let s='';
  s+=`<circle cx="100" cy="100" r="34" style="fill:none;stroke:var(--line);stroke-width:.6"/><circle cx="100" cy="100" r="92" style="fill:none;stroke:var(--line2);stroke-width:.6"/>`;
  bins.forEach((v,h)=>{const a0=h/24*360+1.5,a1=(h+1)/24*360-1.5;const len=v/max*56;if(len>0.5){const r=34+len/2;s+=`<path d="${arcPath(r,a0,a1)}" style="fill:none;stroke:${h===peak?'#C8553D':'var(--ink)'};stroke-width:${len};opacity:${h===peak?1:.25+.6*v/max}"/>`}});
  [0,6,12,18].forEach(h=>{const[x,y]=polar(100,h/24*360);s+=`<text x="${x}" y="${y+3}" text-anchor="middle">${h}</text>`});
  const tot=bins.reduce((a,b)=>a+b,0);
  return {svg:`<div class="chart" style="max-width:280px;margin:0 auto"><svg viewBox="-10 -10 220 220">${s}<text x="100" y="97" text-anchor="middle" style="font-size:8px">PEAK</text><text x="100" y="112" text-anchor="middle" style="font-size:14px;fill:var(--ink)">${tot?pad(peak)+':00':'—'}</text></svg></div>`,peak,tot};
}
function vStats(anim){
  const k=todayK();const today=dayAgg(k);
  const all=allSessions();const total=all.reduce((a,s)=>a+s.dur,0)+(S.core.timer?timerElapsed():0);
  const bySub={};all.forEach(s=>bySub[s.sub]=(bySub[s.sub]||0)+s.dur);if(S.core.timer)bySub[S.core.timer.subjectId]=(bySub[S.core.timer.subjectId]||0)+timerElapsed();
  const subIds=Object.keys(bySub).sort((a,b)=>bySub[b]-bySub[a]);
  const studiedDays=new Set(all.map(s=>s.d));if(today.total)studiedDays.add(k);
  let streak=0;{let d=today.total?k:addDays(k,-1);while(studiedDays.has(d)){streak++;d=addDays(d,-1)}}
  const w7=lastDays(7);const w7lab=w7.map(x=>DOW[pdk(x).getDay()]);
  const w7tot=w7.reduce((a,x)=>a+dayAgg(x).total,0);const prev7=lastDays(7,addDays(k,-7)).reduce((a,x)=>a+dayAgg(x,false).total,0);
  const hd=hourDial();
  const shareAgg={by:bySub,order:subIds,total};
  return `<header class="top"><div><div class="lbl">STATISTICS · 통계</div><h1>Pattern</h1></div></header>
  <section class="sec" style="padding-top:0"><div class="sec-h"><h2><span class="idx">01</span>누적</h2><span class="muted" style="font-size:12px">${studiedDays.size}일 공부 · 연속 ${streak}일</span></div>
    <div class="grid2">
      <div>${ringBlock({plan:null,agg:shareAgg,goalMin:Math.max(1,total/60000),animate:anim,ticks:false},`<div class="lbl">TOTAL</div><div class="big num" style="font-size:42px">${Math.floor(total/3600000)}<span style="font-size:16px;color:var(--ink3)">h</span></div><div class="small num">${pad(Math.floor(total/60000)%60)}m</div>`,280)}</div>
      <ul class="plist">${subIds.map(sid=>{const w=total?bySub[sid]/total*100:0;return `<li class="prow">${swatch(subColor(sid))}<span class="nm">${esc(subName(sid))}</span><span class="vv"><b class="num">${fmtDur(bySub[sid])}</b> · <span class="num">${w.toFixed(1)}%</span></span><div class="bar"><i style="width:${w}%;background:${subColor(sid)}"></i></div></li>`}).join('')||'<div class="empty">기록이 쌓이면 과목별 비중이 나타나요</div>'}</ul>
    </div>
  </section>
  <section class="sec"><div class="sgrid">
    <div><div class="sec-h"><h2><span class="idx">02</span>최근 7일</h2><span class="num" style="font-size:13px">${fmtHM(w7tot)} <span class="muted">${prev7?(w7tot>=prev7?'▲':'▼')+' '+Math.abs(Math.round((w7tot-prev7)/prev7*100))+'%':''}</span></span></div>${stackedBars(w7,{labels:w7lab})}<p class="muted" style="font-size:11px;margin-top:6px">점선 = 그날의 목표</p></div>
    <div><div class="sec-h"><h2><span class="idx">03</span>시간대 패턴</h2></div>${hd.svg}<p class="muted" style="font-size:12px;text-align:center;margin-top:8px">${hd.tot?`가장 집중하는 시간은 <b style="color:var(--ink)">${hd.peak}시</b> 무렵이에요`:'기록이 쌓이면 24시간 패턴이 그려집니다'}</p></div>
  </div></section>`;
}

/* ================= PLAN ================= */
function planPreview(k){
  const p=planFor(k);const sum=planSum(p);const agg=dayAgg(k);
  const goal=p&&p.goal?p.goal:sum;
  const center=sum?`<div class="lbl">PLAN · 계획</div><div class="big num" style="font-size:44px">${fmtHM(sum*60000)}</div><div class="small">${p.goal&&p.goal!==sum?`목표 <span class="num">${fmtHM(p.goal*60000)}</span> · `:''}실제 <span class="num">${fmtHM(agg.total)}</span></div>`:`<div class="lbl">NO PLAN · 계획 없음</div><div class="big num" style="font-size:36px;color:var(--ink3)">${fmtHM(agg.total)}</div><div class="small">과목을 추가하면<br>원이 과목별로 나뉩니다</div>`;
  return ringBlock({plan:sum?p:null,agg,goalMin:goal||S.core.settings.goalMin,planOnly:k>todayK()},center,320);
}
function vPlan(anim){
  return `<header class="top"><div><div class="lbl">PLANNING · 계획</div><h1>Plan</h1></div><div class="seg"><button class="${UI.planTab==='day'?'on':''}" data-act="planTab" data-v="day">하루 계획</button><button class="${UI.planTab==='tpl'?'on':''}" data-act="planTab" data-v="tpl">반복 시간표</button></div></header>
  ${UI.planTab==='day'?vPlanDay():vPlanTpl()}`;
}
function vPlanDay(){
  const k=UI.planDate;const d=pdk(k);const p=planFor(k);const items=p?p.items||[]:[];const sum=planSum(p);
  const rel=k===todayK()?'오늘':k===addDays(todayK(),1)?'내일':k===addDays(todayK(),-1)?'어제':'';
  const used=new Set(items.map(i=>i.subjectId));
  return `<div class="datenav"><button data-act="planDay" data-v="-1">‹</button><div class="d"><div class="lbl">${DOWE[d.getDay()]} ${rel?'· '+rel:''}</div><b class="num">${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}</b></div><button data-act="planDay" data-v="1">›</button></div>
  ${p&&p.derived?`<div class="banner"><span>‘${esc(p.tplName)}’ 시간표가 자동 적용됐어요. 수정하면 이 날짜에만 반영됩니다.</span></div>`:''}
  ${p&&!p.derived&&p.tplName?`<div class="banner"><span>‘${esc(p.tplName)}’에서 불러온 계획</span></div>`:''}
  <div class="grid2">
    <div id="planPrev">${planPreview(k)}</div>
    <div>
      <div class="between" style="padding-bottom:14px;border-bottom:1px solid var(--line)"><div><div class="lbl">목표 총 공부 시간</div><div class="muted" style="font-size:12px;margin-top:2px">비워두면 과목 합계 <span class="num" id="planSum">${fmtHM(sum*60000)}</span></div></div>${hmInputs(p&&p.goal||0,'data-chg="goal"')}</div>
      <div id="pItems">${items.map((it,i)=>`<div class="pitem" data-i="${i}">
        <div class="ord"><button data-act="pMove" data-i="${i}" data-v="-1">▲</button><button data-act="pMove" data-i="${i}" data-v="1">▼</button></div>
        <div class="selwrap">${swatch(subColor(it.subjectId))}<select class="in" data-chg="pSub" data-i="${i}">${subOptions(it.subjectId)}</select></div>
        ${hmInputs(it.min,`data-chg="pMin" data-i="${i}"`)}
        <button class="del" data-act="pDel" data-i="${i}">✕</button>
        <div class="nt"><input class="in" placeholder="세부 목표 (예: 미적분 3단원, 단어 50개)" value="${esc(it.note||'')}" data-chg="pNote" data-i="${i}"></div>
      </div>`).join('')}</div>
      <div class="row mt"><button class="btn sm" data-act="pAdd" ${activeSubs().every(s=>used.has(s.id))?'disabled style="opacity:.4"':''}>+ 과목 추가</button><button class="btn ghost sm" data-act="loadTpl">시간표 불러오기</button><button class="btn ghost sm" data-act="copyPrev">전날 계획 복사</button>${items.length?`<button class="btn ghost sm" data-act="pClear">비우기</button>`:''}</div>
      ${k>=todayK()&&k!==todayK()?'':''}
      <p class="muted mt2" style="font-size:12px;line-height:1.7">순서는 원에서 12시 방향부터 시계방향으로 배치됩니다. 계획은 자동 저장돼요.</p>
    </div>
  </div>
  <section class="sec mt2"><div class="sec-h"><h2>이 날의 일정</h2><button class="link" data-act="editEvent" data-k="${k}">+ 일정</button></div>${scheduleList(k)}</section>`;
}
function refreshPlanPreview(){const k=UI.planDate;const el=$('#planPrev');if(el)el.innerHTML=planPreview(k);const ps=$('#planSum');if(ps)ps.textContent=fmtHM(planSum(planFor(k))*60000)}
function repeatText(r){r=r||{type:'none'};return{none:'직접 불러오기',daily:'매일',weekdays:'평일 (월–금)',dow:'매주 '+(r.dows||[]).slice().sort().map(d=>DOW[d]).join('·'),interval:`${r.every||1}일마다${r.from?' · '+fmtDate(r.from)+'부터':''}`}[r.type]||''}
function vPlanTpl(){
  const ts=S.core.templates;
  return `<p class="ink2" style="font-size:13px;line-height:1.7;margin-bottom:8px">면학 시간처럼 반복되는 시간 단위를 만들어 두면, 반복 주기에 맞는 날짜에 자동으로 계획이 채워집니다. 시간표를 고치면 따로 수정하지 않은 이후 날짜에 모두 반영돼요.</p>
  ${ts.map(t=>{const tot=planSum(planFromTpl(t));return `<div class="tcard" data-act="editTpl" data-id="${t.id}">${dialSVG(t.blocks,96)}<div><div class="between"><h3>${esc(t.name)}</h3><span class="num" style="font-size:13px">${fmtHM(tot*60000)}</span></div><div class="meta">${repeatText(t.repeat)}${t.active===false?' · 자동 적용 꺼짐':''}</div><div class="blks">${(t.blocks||[]).map(b=>`<span><span class="num">${b.start}–${b.end}</span> · ${esc(b.label)} ${(b.items||[]).map(it=>swatch(subColor(it.subjectId))).join(' ')}</span>`).join('')}</div></div></div>`}).join('')||'<div class="empty">아직 만든 시간표가 없어요</div>'}
  <div class="row mt2"><button class="btn solid" data-act="newTpl">+ 새 시간표</button><button class="btn ghost" data-act="sampleTpl">기숙학교 면학 예시로 만들기</button></div>`;
}
function blankTpl(){return{id:uid(),name:'새 시간표',repeat:{type:'weekdays',dows:[],every:2,from:todayK()},active:true,blocks:[{id:uid(),label:'1타임',start:'19:00',end:'20:30',items:[]}]}}
function sampleTpl(){const s=activeSubs();const g=i=>(s[i%Math.max(1,s.length)]||{}).id||'';
  return{id:uid(),name:'면학 시간',repeat:{type:'weekdays',dows:[],every:2,from:todayK()},active:true,blocks:[
  {id:uid(),label:'면학 1타임',start:'19:00',end:'20:30',items:[{id:uid(),start:'19:00',end:'19:50',subjectId:g(0)},{id:uid(),start:'19:50',end:'20:30',subjectId:g(1)}]},
  {id:uid(),label:'면학 2타임',start:'20:40',end:'22:00',items:[{id:uid(),start:'20:40',end:'21:20',subjectId:g(2)},{id:uid(),start:'21:20',end:'22:00',subjectId:g(3)}]},
  {id:uid(),label:'면학 3타임',start:'22:10',end:'23:00',items:[{id:uid(),start:'22:10',end:'23:00',subjectId:g(0)}]}]}}
function tplBody(){
  const t=UI.tplDraft;const r=t.repeat;
  return `<div class="sh"><div><div class="lbl">TIMETABLE</div><h2>시간표 편집</h2></div><button class="close" data-act="closeSheet">✕</button></div>
  <div class="grid2" style="gap:18px;grid-template-columns:auto 1fr">
    <div id="tplDial">${dialSVG(t.blocks,120)}</div>
    <div class="stack">
      <label class="field"><span>이름</span><input class="in" data-tf="name" value="${esc(t.name)}"></label>
      <label class="field"><span>반복 주기</span><select class="in" data-tf="rtype">${[['none','반복 없음 (직접 불러오기)'],['daily','매일'],['weekdays','평일'],['dow','특정 요일'],['interval','사용자 지정 (N일마다)']].map(([v,n])=>`<option value="${v}" ${r.type===v?'selected':''}>${n}</option>`).join('')}</select></label>
    </div>
  </div>
  ${r.type==='dow'?`<div class="dows mt">${DOW.map((d,i)=>`<button data-act="tDow" data-v="${i}" class="${(r.dows||[]).includes(i)?'on':''}">${d}</button>`).join('')}</div>`:''}
  ${r.type==='interval'?`<div class="fgrid mt"><label class="field"><span>며칠마다</span><input class="in num" type="number" min="1" data-tf="every" value="${r.every||2}"></label><label class="field"><span>시작일</span><input class="in num" type="date" data-tf="from" value="${r.from||todayK()}"></label></div>`:''}
  <div class="between mt" style="padding:10px 0;border-bottom:1px solid var(--line2)"><span style="font-size:13px">반복 날짜에 자동 적용</span><button class="toggle ${t.active!==false?'on':''}" data-act="tActive"></button></div>
  <div class="lbl mt2" style="margin-bottom:10px">TIME BLOCKS · 기본 시간 단위</div>
  ${t.blocks.map(b=>`<div class="block">
    <div class="bh"><label class="field"><span>타임 이름</span><input class="in" data-tf="bLabel" data-b="${b.id}" value="${esc(b.label)}"></label><label class="field"><span>시작</span><input class="in num" type="time" data-tf="bStart" data-b="${b.id}" value="${b.start}"></label><label class="field"><span>끝</span><input class="in num" type="time" data-tf="bEnd" data-b="${b.id}" value="${b.end}"></label><button class="x" data-act="tDelBlock" data-b="${b.id}">✕</button></div>
    ${(b.items||[]).map(it=>`<div class="bi"><input class="in num" type="time" data-tf="iStart" data-b="${b.id}" data-it="${it.id}" value="${it.start}"><input class="in num" type="time" data-tf="iEnd" data-b="${b.id}" data-it="${it.id}" value="${it.end}"><div class="selwrap">${swatch(subColor(it.subjectId))}<select class="in" data-tf="iSub" data-b="${b.id}" data-it="${it.id}">${subOptions(it.subjectId,true)}</select></div><button class="x" data-act="tDelItem" data-b="${b.id}" data-it="${it.id}">✕</button></div>`).join('')}
    <button class="link mt" style="display:inline-block" data-act="tAddItem" data-b="${b.id}">+ 세부 계획</button>
  </div>`).join('')}
  <button class="btn ghost sm" data-act="tAddBlock">+ 타임 추가</button>
  <div class="row mt2" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:18px">${S.core.templates.some(x=>x.id===t.id)?`<button class="btn danger sm" data-act="tDelete">삭제</button>`:'<span></span>'}<div class="row"><button class="btn ghost" data-act="closeSheet">취소</button><button class="btn solid" data-act="tSave">저장</button></div></div>`;
}
function openTpl(t){UI.tplDraft=clone(t);openSheet(tplBody())}
function rerenderTpl(){const sh=$('#sheet');if(!sh)return;const st=sh.scrollTop;sh.innerHTML=`<div class="grab"></div>`+tplBody();sh.scrollTop=st}
function openLoadTpl(){
  const ts=S.core.templates;
  openSheet(`<div class="sh"><div><div class="lbl">${fmtDate(UI.planDate)}</div><h2>시간표 불러오기</h2></div><button class="close" data-act="closeSheet">✕</button></div>
  ${ts.length?ts.map(t=>`<div class="tcard" data-act="applyTpl" data-id="${t.id}">${dialSVG(t.blocks,80)}<div><h3>${esc(t.name)}</h3><div class="meta">${repeatText(t.repeat)} · ${fmtHM(planSum(planFromTpl(t))*60000)}</div></div></div>`).join(''):`<div class="empty">저장된 시간표가 없어요.</div><button class="btn solid" data-act="gotoTpl">시간표 만들기</button>`}`);
}

/* ================= PREFS ================= */
function vPrefs(){
  const st=S.core.settings;
  return `<header class="top"><div><div class="lbl">PREFERENCES · 설정</div><h1>Settings</h1></div></header>
  <section class="sec" style="padding-top:0"><div class="sec-h"><h2><span class="idx">01</span>과목</h2><button class="link" data-act="addSub">+ 과목 추가</button></div>
    ${activeSubs().map(s=>`<div class="subrow"><button class="swbtn" style="background:${s.color}" data-act="pickColor" data-id="${s.id}" title="색상"></button><input class="in" value="${esc(s.name)}" data-chg="subName" data-id="${s.id}"><button class="link" data-act="delSub" data-id="${s.id}">삭제</button></div><div class="palette" id="pal-${s.id}" hidden>${PALETTE.map(c=>`<button style="background:${c}" class="${c===s.color?'on':''}" data-act="setColor" data-id="${s.id}" data-c="${c}"></button>`).join('')}<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink3)"><input type="color" value="${s.color}" data-chg="subColor" data-id="${s.id}" style="width:28px;height:28px;border:0;background:none;padding:0">직접</label></div>`).join('')}
  </section>
  <section class="sec"><div class="sec-h"><h2><span class="idx">02</span>테마</h2></div>
    <div class="seg">${[['auto','시스템'],['light','라이트'],['dark','다크']].map(([v,n])=>`<button class="${st.theme===v?'on':''}" data-act="theme" data-v="${v}">${n}</button>`).join('')}</div>
  </section>
  <section class="sec"><div class="sec-h"><h2><span class="idx">03</span>기본 목표</h2></div>
    <div class="between"><span class="ink2" style="font-size:13px">계획이 없는 날의 하루 목표 공부 시간</span>${hmInputs(st.goalMin,'data-chg="goalDefault"')}</div>
  </section>
  <section class="sec"><div class="sec-h"><h2><span class="idx">04</span>데이터</h2></div>
    <p class="ink2" style="font-size:12.5px;line-height:1.7;margin-bottom:14px">모든 데이터는 이 브라우저에 저장됩니다. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에 백업 파일을 내려받아 두세요.</p>
    <div class="row"><button class="btn sm" data-act="exportData">백업 내려받기</button><label class="btn ghost sm" style="cursor:pointer">백업 불러오기<input type="file" accept="application/json,.json" data-chg="importFile" hidden></label><button class="btn danger sm" data-act="resetData">전체 초기화</button></div>
    <p class="muted mt" style="font-size:12px">기록 <span class="num">${allSessions().length}</span>개 · 계획 <span class="num">${Object.keys(S.core.plans).length}</span>일 · 시간표 <span class="num">${S.core.templates.length}</span>개 · 일정 <span class="num">${S.core.events.length}</span>개</p>
  </section>`;
}

/* ================= events ================= */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');if(!el)return;
  const a=el.dataset.act,ds=el.dataset;
  if(el.tagName==='BUTTON'||el.dataset.act)e.stopPropagation();
  switch(a){
    case 'go':if(e.target.closest('.ctl'))return;closeSheet(true);go(ds.v);break;
    case 'closeSheet':closeSheet();break;
    case 'start':startTimer(ds.id);render(false);break;
    case 'pause':e.stopPropagation();pauseTimer();render(false);break;
    case 'resume':e.stopPropagation();resumeTimer();render(false);break;
    case 'stop':e.stopPropagation();stopTimer();render(false);break;
    case 'switchSub':openSwitch();break;
    case 'doSwitch':if(S.core.timer&&ds.id!==S.core.timer.subjectId){stopTimer(true);startTimer(ds.id)}closeSheet();render(false);break;
    case 'planFor':closeSheet(true);UI.planDate=ds.k;UI.planTab='day';go('plan');break;
    case 'calNav':{if(ds.v==='0')UI.calMonth=todayK().slice(0,7);else{const[y,m]=UI.calMonth.split('-').map(Number);const d=new Date(y,m-1+(+ds.v),1);UI.calMonth=`${d.getFullYear()}-${pad(d.getMonth()+1)}`}render(true);break}
    case 'day':openDay(ds.k);break;
    case 'editSession':openSessionEdit(ds.k,ds.id);break;
    case 'delSession':if(await confirmBox('이 기록을 삭제할까요?','삭제')){const m=S.months[ds.k.slice(0,7)];m.sessions=m.sessions.filter(s=>s.id!==ds.id);commit([ds.k.slice(0,7)]);render(false);openDay(ds.k);toast('삭제했어요')}break;
    case 'editEvent':openEventEdit(ds.k||todayK(),ds.id);break;
    case 'delEvent':if(await confirmBox('이 일정을 삭제할까요?','삭제')){S.core.events=S.core.events.filter(x=>x.id!==ds.id);commit();closeSheet();render(false)}break;
    case 'planTab':UI.planTab=ds.v;render(true);break;
    case 'planDay':UI.planDate=addDays(UI.planDate,+ds.v);render(true);break;
    case 'pAdd':{const p=ensurePlan(UI.planDate);const used=new Set(p.items.map(i=>i.subjectId));const s=activeSubs().find(s=>!used.has(s.id));if(!s)return;p.items.push({subjectId:s.id,min:60,note:''});delete p.tplName;commit();render(false);break}
    case 'pDel':{const p=ensurePlan(UI.planDate);p.items.splice(+ds.i,1);commit();render(false);break}
    case 'pMove':{const p=ensurePlan(UI.planDate);const i=+ds.i,j=i+(+ds.v);if(j<0||j>=p.items.length)return;[p.items[i],p.items[j]]=[p.items[j],p.items[i]];commit();render(false);break}
    case 'pClear':if(await confirmBox('이 날의 계획을 비울까요?','비우기')){S.core.plans[UI.planDate]={goal:0,items:[],cleared:true};commit();render(false)}break;
    case 'copyPrev':{const prev=planFor(addDays(UI.planDate,-1));if(!prev||!planSum(prev)){toast('전날 계획이 없어요');return}const c=clone(prev);delete c.derived;S.core.plans[UI.planDate]=c;commit();render(true);toast('전날 계획을 복사했어요');break}
    case 'loadTpl':openLoadTpl();break;
    case 'applyTpl':{const t=S.core.templates.find(x=>x.id===ds.id);if(!t)return;const p=planFromTpl(t);S.core.plans[UI.planDate]=p;commit();closeSheet();render(true);toast(`‘${t.name}’을 불러왔어요`);break}
    case 'gotoTpl':closeSheet();UI.planTab='tpl';render(true);break;
    case 'newTpl':openTpl(blankTpl());break;
    case 'sampleTpl':openTpl(sampleTpl());break;
    case 'editTpl':{const t=S.core.templates.find(x=>x.id===ds.id);if(t)openTpl(t);break}
    case 'tDow':{const r=UI.tplDraft.repeat;r.dows=r.dows||[];const v=+ds.v;r.dows=r.dows.includes(v)?r.dows.filter(x=>x!==v):[...r.dows,v];rerenderTpl();break}
    case 'tActive':UI.tplDraft.active=UI.tplDraft.active===false;rerenderTpl();break;
    case 'tAddBlock':{const bs=UI.tplDraft.blocks;const last=bs[bs.length-1];const st=last?last.end:'19:00';const m=tToMin(st)+10;const s2=`${pad(Math.floor(m/60)%24)}:${pad(m%60)}`;const e2m=m+60;bs.push({id:uid(),label:`${bs.length+1}타임`,start:s2,end:`${pad(Math.floor(e2m/60)%24)}:${pad(e2m%60)}`,items:[]});rerenderTpl();break}
    case 'tDelBlock':UI.tplDraft.blocks=UI.tplDraft.blocks.filter(b=>b.id!==ds.b);rerenderTpl();break;
    case 'tAddItem':{const b=UI.tplDraft.blocks.find(b=>b.id===ds.b);const last=b.items[b.items.length-1];const st=last?last.end:b.start;const em=Math.min(tToMin(b.end),tToMin(st)+40);b.items.push({id:uid(),start:st,end:`${pad(Math.floor(em/60))}:${pad(em%60)}`,subjectId:(activeSubs()[b.items.length%Math.max(1,activeSubs().length)]||{}).id||''});rerenderTpl();break}
    case 'tDelItem':{const b=UI.tplDraft.blocks.find(b=>b.id===ds.b);b.items=b.items.filter(i=>i.id!==ds.it);rerenderTpl();break}
    case 'tSave':{const t=UI.tplDraft;if(!t.name.trim()){toast('이름을 입력하세요');return}const bad=t.blocks.find(b=>tToMin(b.end)<=tToMin(b.start)||b.items.some(i=>tToMin(i.end)<=tToMin(i.start)));if(bad){toast('끝 시각이 시작보다 늦어야 해요');return}const i=S.core.templates.findIndex(x=>x.id===t.id);if(i>=0)S.core.templates[i]=t;else S.core.templates.push(t);commit();closeSheet();render(false);toast('시간표를 저장했어요');break}
    case 'tDelete':if(await confirmBox('이 시간표를 삭제할까요? 이미 불러온 날짜의 계획은 유지됩니다.','삭제')){S.core.templates=S.core.templates.filter(x=>x.id!==UI.tplDraft.id);commit();closeSheet();render(false)}break;
    case 'addSub':{const used=new Set(S.core.subjects.map(s=>s.color));const c=PALETTE.find(c=>!used.has(c))||PALETTE[S.core.subjects.length%PALETTE.length];S.core.subjects.push({id:uid(),name:'새 과목',color:c});commit();render(false);const ins=$$('[data-chg=subName]');ins[ins.length-1]?.focus();ins[ins.length-1]?.select();break}
    case 'delSub':if(await confirmBox(`‘${subName(ds.id)}’ 과목을 삭제할까요? 지난 기록은 그대로 남습니다.`,'삭제')){const s=subj(ds.id);s.archived=true;commit();render(false)}break;
    case 'pickColor':{const p=$('#pal-'+ds.id);p.hidden=!p.hidden;break}
    case 'setColor':{subj(ds.id).color=ds.c;commit();render(false);break}
    case 'theme':S.core.settings.theme=ds.v;applyTheme();commit();render(false);break;
    case 'exportData':{const blob=new Blob([JSON.stringify(S,null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`orbit-backup-${todayK()}.json`;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);toast('백업 파일을 내려받았어요');break}
    case 'resetData':if(await confirmBox('모든 기록, 계획, 시간표, 일정을 삭제합니다. 되돌릴 수 없어요.','전체 삭제')){const ms=Object.keys(S.months);S={core:defaultCore(),months:{}};ms.forEach(m=>S.months[m]={sessions:[]});commit(ms);applyTheme();render(true);toast('초기화했어요')}break;
  }
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.dataset.tf){tplField(el);return}
  const c=el.dataset.chg;if(!c)return;const k=UI.planDate;
  switch(c){
    case 'goal':{const p=ensurePlan(k);p.goal=readHM(el);commit();refreshPlanPreview();break}
    case 'pSub':{const p=ensurePlan(k);p.items[+el.dataset.i].subjectId=el.value;commit();render(false);break}
    case 'pMin':{const p=ensurePlan(k);p.items[+el.dataset.i].min=readHM(el);commit();refreshPlanPreview();break}
    case 'pNote':{const p=ensurePlan(k);p.items[+el.dataset.i].note=el.value;commit();break}
    case 'subName':{const s=subj(el.dataset.id);s.name=el.value.trim()||s.name;commit();break}
    case 'subColor':{subj(el.dataset.id).color=el.value;commit();render(false);break}
    case 'importFile':{const f=el.files&&el.files[0];if(!f)return;f.text().then(async txt=>{try{const o=JSON.parse(txt);if(!o.core)throw 0;if(!await confirmBox('현재 데이터를 백업 내용으로 바꿀까요?','복원',false))return;S=normalize(o);commit();applyTheme();render(true);toast('복원했어요')}catch(err){toast('올바른 백업 파일이 아니에요')}});el.value='';break}
    case 'goalDefault':S.core.settings.goalMin=readHM(el);commit();break;
  }
});
function tplField(el){
  const t=UI.tplDraft;if(!t)return;const f=el.dataset.tf;const b=el.dataset.b?t.blocks.find(x=>x.id===el.dataset.b):null;const it=b&&el.dataset.it?b.items.find(x=>x.id===el.dataset.it):null;
  switch(f){
    case 'name':t.name=el.value;break;
    case 'rtype':t.repeat.type=el.value;if(el.value==='interval'&&!t.repeat.from)t.repeat.from=todayK();rerenderTpl();return;
    case 'every':t.repeat.every=Math.max(1,+el.value||1);break;
    case 'from':t.repeat.from=el.value;break;
    case 'bLabel':b.label=el.value;break;
    case 'bStart':b.start=el.value;break;
    case 'bEnd':b.end=el.value;break;
    case 'iStart':it.start=el.value;break;
    case 'iEnd':it.end=el.value;break;
    case 'iSub':it.subjectId=el.value;rerenderTpl();return;
  }
  const d=$('#tplDial');if(d)d.innerHTML=dialSVG(t.blocks,120);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#sheet'))render(false)});

/* ---------------- tick ---------------- */
function refreshLive(){
  if(UI.view==='home'){const r=$('#hRing');if(r)r.innerHTML=homeRing(false);const k=$('#hKpi');if(k)k.innerHTML=homeKpis();const pl=$('#hPlan');if(pl)pl.innerHTML=planList(todayK())}
}
setInterval(()=>{
  if(UI.lastDay!==todayK()){UI.lastDay=todayK();render(false);return}
  if(S.core.timer&&!S.core.timer.paused&&!document.hidden)refreshLive();
},1000);

/* ---------------- boot ---------------- */
loadLocal();applyTheme();
UI.view=VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):'home';
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
render(true);
