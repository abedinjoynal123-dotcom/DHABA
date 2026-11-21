(function(){
"use strict";
const $ = s => document.querySelector(s);
/* ---------- language ---------- */
const LANGS=["et","en","ru"], LOC={et:"et-EE",en:"en-GB",ru:"ru-RU"};
let LANG = (()=>{ try{ const s=localStorage.getItem("kf_lang"); if(LANGS.includes(s)) return s; }catch(e){} const n=(navigator.language||"et").slice(0,2).toLowerCase(); return LANGS.includes(n)?n:"et"; })();
let FMT=null;
function fmtInit(){ FMT={ money:new Intl.NumberFormat(LOC[LANG],{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}), money0:new Intl.NumberFormat(LOC[LANG],{style:"currency",currency:"EUR",maximumFractionDigits:0}) }; }
function t(k, v){ let s=(T[LANG]&&T[LANG][k]); if(s==null) s=T.en[k]; if(s==null) return k; if(Array.isArray(s)) s=s[0]; return v ? String(s).replace(/\{(\w+)\}/g,(m,x)=>v[x]!=null?v[x]:m) : s; }
function tn(k, n, v){ const forms=(T[LANG]&&T[LANG][k])||T.en[k]; let i;
  if(LANG==="ru"){ const m10=n%10, m100=n%100; i = (m10===1&&m100!==11)?0 : (m10>=2&&m10<=4&&(m100<12||m100>14))?1 : 2; } else i = n===1?0:1;
  const s=forms[Math.min(i,forms.length-1)]; return s.replace(/\{(\w+)\}/g,(m,x)=>x==="n"?n:(v&&v[x]!=null?v[x]:m)); }
const r2 = n => Math.round((Number(n)||0)*100)/100;
const eur = n => FMT.money.format(r2(n)).replace("-","−");
const signed = n => { const v=r2(n); return (v>0?"+":"")+eur(v); };
const pad = n => String(n).padStart(2,"0");
const dayKey = (d=new Date()) => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const int = v => { const n=parseInt(v,10); return isNaN(n)?0:n; };
const num = v => { let x=String(v??"").replace(/[\s\u00a0€]/g,""); if(x.includes(",")&&x.includes(".")) x = x.lastIndexOf(",")>x.lastIndexOf(".") ? x.replace(/\./g,"").replace(",",".") : x.replace(/,/g,""); else x=x.replace(",","."); if(!/^-?\d*\.?\d+$/.test(x)) return null; const n=parseFloat(x); return isFinite(n)?n:null; };
const hm = x => { if(!x) return ""; const d=new Date(x); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const dmy = x => { const d=new Date(x); return pad(d.getDate())+"."+pad(d.getMonth()+1)+"."+d.getFullYear(); };
const startOf = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d).getTime(); };
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function appPrice(p){ const x=p*1.4, b=Math.floor(x+1e-9); for (const c of [b+0.5,b+0.9,b+1.5]) if (c>=x-1e-9) return r2(c); return r2(x); }
const priceFor = (item, ch) => ch==="Kiosk" ? r2(item.price) : appPrice(Number(item.price)||0);
const OPEN_H=11, CLOSE_H=21, TAB=Math.random().toString(36).slice(2);
const isOpenStatus = s => s==="new"||s==="preparing"||s==="ready";
const stLabel = s => ["new","preparing","ready","done","cancelled"].includes(s) ? t("st."+s) : String(s||"");
const chanLabel = c => c==="Kiosk" ? t("kiosk") : c==="Bolt" ? "Bolt Food" : c==="Web" ? t("web") : String(c||"");
const NET = window.KF_NET || null;
const assetUrl = id => (NET ? "/api/pos/asset/" : "/_blob/") + id;
const payLabel = p => p==="Card" ? t("card") : p==="Cash" ? t("cash") : p==="Web" ? t("web.unpaid") : chanLabel(p);
const dineLabel = d => d==="Eat in" ? t("eatin") : d==="Takeaway" ? t("takeaway") : d==="Delivery" ? t("delivery") : String(d||"");
const itemLabel = i => String(i.name||"") + (i.option ? " · "+i.option : "");
const items = o => Array.isArray(o.items) ? o.items : [];

const S = { menu:[], today:[], dayOrders:[], settings:{vatRate:24, quickNotes:["Ilma sibulata","Vürtsikas","Lisakaste","Ilma kasteta","Kaste eraldi"]},
  cat:"*", cart:[], channel:"Kiosk", pay:"Card", dine:"Takeaway", disc:"none", notes:new Set(), view:"till",
  todayKey:dayKey(), day:dayKey(), live:false, readOnly:false, soldMode:false, lastOrder:null, dayReport:null, sound:false,
  placing:false, pending:new Set(), editingMenu:false, connecting:true, offlineOk:false };
let USER=null;

/* ---------- storage: shared db, or this device as fallback ---------- */
const DEMO = window.KF_DEMO || null;
const local = DEMO ? {
  read(k,f){ return k in DEMO.mem ? JSON.parse(JSON.stringify(DEMO.mem[k])) : f; },
  write(k,v){ DEMO.mem[k]=JSON.parse(JSON.stringify(v)); return true; }
} : {
  read(k,f){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):f; }catch(e){ return f; } },
  write(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
};
let db=null;
const subs = {};
const docs = s => s.docs.map(d=>({id:d.id,...d.data()}));
function live(key, makeRef, onData){
  if(subs[key]) subs[key]();
  let alive=true;
  const go=()=>{ if(!alive) return; let un=()=>{};
    try{ un = makeRef().onSnapshot(onData, e=>{
      if(!alive) return;
      if(e && (e.code==="unavailable"||e.code==="resource_exhausted")) setTimeout(go, 3000+Math.random()*2000);
      else if(e && e.code!=="revoked") toast(t("e.load",{x:e.message||""}));
    }); }catch(e){ setTimeout(go,4000); }
    subs[key]=()=>{ alive=false; un(); };
  };
  go();
}
const L = { menuCbs:[], todayCb:null, dayCb:null, dayOrdersKey:"", rangeCb:null, rangeFrom:0, rangeTo:0, settingsCb:null, repCb:null, repKey:"" };
const localOrders = () => local.read("kf_orders",[]);
function localNotify(){
  const all=localOrders();
  L.todayCb && L.todayCb(all.filter(o=>o.day===S.todayKey));
  L.dayCb && L.dayCb(all.filter(o=>o.day===L.dayOrdersKey));
  L.rangeCb && L.rangeCb(all.filter(o=>o.createdAt>=L.rangeFrom&&o.createdAt<L.rangeTo));
}
async function retry(fn){ try{ return await fn(); }catch(e){ if(e && e.code==="unavailable"){ await sleep(600+Math.random()*600); return await fn(); } throw e; } }
const LC = { cbs:{} };
const lcRead = c => local.read("kf_c_"+c, {});
function lcWrite(c, all){ local.write("kf_c_"+c, all); Object.values(LC.cbs[c]||{}).forEach(f=>f(Object.entries(all).map(([id,d])=>({id,...d})))); }
const store = {
  subColl(key, c, cb, filt){ if(db){ live(key, ()=>filt?filt(db.collection(c)):db.collection(c), s=>cb(docs(s), s.metadata)); } else { (LC.cbs[c]=LC.cbs[c]||{})[key]=cb; cb(Object.entries(lcRead(c)).map(([id,d])=>({id,...d}))); } },
  async setDoc(c, id, d){ if(db){ await retry(()=>db.doc(c+"/"+id).set(d)); return; } const all=lcRead(c); all[id]=d; lcWrite(c,all); },
  async patchDoc(c, id, p){ if(db){ await retry(()=>db.doc(c+"/"+id).update(p)); return; } const all=lcRead(c); if(!all[id]) throw {code:"invalid_argument"}; all[id]={...all[id],...p}; lcWrite(c,all); },
  async delDoc(c, id){ if(db){ await retry(()=>db.doc(c+"/"+id).delete()); return; } const all=lcRead(c); delete all[id]; lcWrite(c,all); },
  subMenu(cb){ if(db) live("menu", ()=>db.collection("menu"), s=>cb(docs(s))); else { L.menuCbs.push(cb); cb(local.read("kf_menu",[])); } },
  subSettings(cb){ if(db) live("set", ()=>db.doc("settings/main"), s=>cb(s.exists?s.data():null)); else { L.settingsCb=cb; cb(local.read("kf_settings",null)); } },
  subToday(day, cb){ if(db) live("today", ()=>db.collection("orders").where("day","==",day), s=>cb(docs(s))); else { L.todayCb=cb; cb(localOrders().filter(o=>o.day===day)); } },
  subDayOrders(day, cb){ if(db) live("dayOrders", ()=>db.collection("orders").where("day","==",day), s=>cb(docs(s))); else { L.dayCb=cb; L.dayOrdersKey=day; cb(localOrders().filter(o=>o.day===day)); } },
  subRange(from, to, cb){
    if(db) live("range", ()=>db.collection("orders").where("createdAt",">=",from).where("createdAt","<",to).orderBy("createdAt","desc").limit(1000), s=>cb(docs(s)));
    else { L.rangeCb=cb; L.rangeFrom=from; L.rangeTo=to; cb(localOrders().filter(o=>o.createdAt>=from&&o.createdAt<to)); }
  },
  subLastWeek(day, cb){ if(db) live("lastWeek", ()=>db.collection("orders").where("day","==",day), s=>cb(docs(s))); else cb(localOrders().filter(o=>o.day===day)); },
  subReport(day, cb){ if(db) live("rep", ()=>db.doc("days/"+day), s=>cb(s.exists?s.data():null)); else { L.repCb=cb; L.repKey=day; cb(local.read("kf_days",{})[day]||null); } },
  async getDays(from, to){
    if(db){ const s=await retry(()=>db.collection("days").where("date",">=",from).where("date","<=",to).get()); return docs(s); }
    return Object.entries(local.read("kf_days",{})).map(([k,v])=>({id:k,...v})).filter(d=>d.date>=from&&d.date<=to);
  },
  async claimNumber(day, floor){
    if(!db) return floor+1;
    if(NET) return await NET.number(day, floor);
    const ref=db.doc("counters/"+day);
    for(let i=0;i<12;i++){
      let lease=null; try{ lease=await ref.acquire({holder:TAB, ttlMs:1500}); }catch(e){ break; }
      if(lease && lease.acquired){
        const snap=await ref.get(); let cur=snap.exists ? int(snap.data().n) : 0;
        if(!snap.exists){ try{ const q=await db.collection("orders").where("day","==",day).get(); cur=q.docs.reduce((mx,d)=>Math.max(mx,int(d.data().num)),0); }catch(e){} }
        const n=Math.max(cur, floor)+1; await ref.set({n, day}); return n;
      }
      await sleep(150+Math.random()*200);
    }
    return floor+1;
  },
  async addOrder(o){
    if(db){ const ref=db.collection("orders").doc(); await retry(()=>ref.set(o)); return; }
    const all=localOrders(); all.push({id:"o"+Date.now()+Math.random().toString(36).slice(2,6),...o});
    if(!local.write("kf_orders",all)) throw {code:"local_full"}; localNotify();
  },
  async updateOrder(id, patch){ if(db){ await retry(()=>db.doc("orders/"+id).update(patch)); return; } local.write("kf_orders", localOrders().map(o=>o.id===id?{...o,...patch}:o)); localNotify(); },
  async setMenu(id, data){ if(db){ await retry(()=>db.doc("menu/"+id).set(data)); return; } const m=local.read("kf_menu",[]).filter(x=>x.id!==id); m.push({id,...data}); local.write("kf_menu",m); L.menuCbs.forEach(c=>c(m)); },
  async patchMenu(id, patch){ if(db){ await retry(()=>db.doc("menu/"+id).update(patch)); return; } const m=local.read("kf_menu",[]).map(x=>x.id===id?{...x,...patch}:x); local.write("kf_menu",m); L.menuCbs.forEach(c=>c(m)); },
  async delMenu(id){ if(db){ await retry(()=>db.doc("menu/"+id).delete()); return; } const m=local.read("kf_menu",[]).filter(x=>x.id!==id); local.write("kf_menu",m); L.menuCbs.forEach(c=>c(m)); },
  async setSettings(d){ if(db){ await retry(()=>db.doc("settings/main").set(d)); return; } local.write("kf_settings",d); L.settingsCb&&L.settingsCb(d); },
  async setReport(day, d){ if(db){ await retry(()=>db.doc("days/"+day).set(d)); return; } const all=local.read("kf_days",{}); all[day]=d; local.write("kf_days",all); if(L.repKey===day) L.repCb&&L.repCb(d); }
};
async function guard(p){
  try{ await p; return true; }
  catch(e){
    const c=e&&e.code;
    if(c==="invalid_argument"){
      let w=null; try{ w = USER ? await USER.can("data.write") : null; }catch(x){}
      if(w===false){ S.readOnly=true; setSync(); toast(t("e.ro")); } else toast(t("e.save"));
    }
    else if(c==="quota_exceeded") toast(t("e.quota"));
    else if(c==="revoked") toast(t("e.revoked"));
    else toast(t("e.save"));
    return false;
  }
}
const canTake = () => !S.readOnly && !S.connecting && (S.live || S.offlineOk) && !!S.user;
function setSync(){
  $("#syncDot").className = "dot " + (S.connecting ? "" : (S.live || DEMO) ? "live" : "shut");
  $("#syncText").textContent = DEMO && !S.connecting ? t("demo.pill") : S.connecting ? t("sync.wait") : S.live ? (S.readOnly ? t("sync.ro") : t("sync.live")) : (S.offlineOk ? t("sync.offOk") : t("sync.off"));
  $("#offline").hidden = S.connecting || S.live || !!DEMO;
  $("#offlineBtn").hidden = S.offlineOk;
  renderAll();
}
let tt, toastFn=null;
function toast(msg, action){
  const el=$("#toast"); $("#toastMsg").textContent=msg; const b=$("#toastBtn");
  toastFn = action ? action.fn : null; b.hidden=!action; if(action) b.textContent=action.label;
  el.hidden=false; clearTimeout(tt); tt=setTimeout(()=>{ el.hidden=true; toastFn=null; }, action?6000:3200);
}
$("#toastBtn").addEventListener("click",async()=>{ const f=toastFn; toastFn=null; $("#toast").hidden=true; if(f) await f(); });
const undo = fn => ({label:t("undo"), fn});

function applyLang(){
  fmtInit();
  document.documentElement.lang=LANG;
  document.querySelectorAll("[data-t]").forEach(el=>{ el.textContent=t(el.dataset.t); });
  document.querySelectorAll("[data-tp]").forEach(el=>{ el.placeholder=t(el.dataset.tp); });
  document.querySelectorAll("[data-ta]").forEach(el=>{ el.setAttribute("aria-label", t(el.dataset.ta)); });
  const second = LANG==="en" ? "et" : "en";
  document.querySelectorAll("[data-t2]").forEach(el=>{ el.textContent=T[second][el.dataset.t2]; el.lang=second; });
  document.querySelectorAll(".lang [data-l]").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.l===LANG)));
  $("#fsBtn").textContent = document.fullscreenElement ? t("fs.exit") : t("fs");
  setTitle(); setSync(); tick(); renderLock(); renderUser();
}
$("#offlineBtn").addEventListener("click",()=>{ S.offlineOk=true; local.write("kf_offline_ok", true); setSync(); });
document.addEventListener("click",e=>{ const b=e.target.closest(".lang [data-l]"); if(!b||b.dataset.l===LANG) return; LANG=b.dataset.l; try{ localStorage.setItem("kf_lang",LANG); }catch(x){} applyLang(); });

/* ---------- sound + keep screen awake ---------- */
let actx=null;
function chime(){
  if(!S.sound) return;
  try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume();
    [0,0.18].forEach((d,i)=>{ const o=actx.createOscillator(), g=actx.createGain(); o.type="sine"; o.frequency.value=i?1175:880;
      const t0=actx.currentTime+d; g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.35,t0+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.35);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0+0.4); });
  }catch(e){}
}
let wake=null;
async function keepAwake(){
  const want = (S.view==="kitchen"||S.view==="pickup") && document.visibilityState==="visible";
  try{
    if(want && !wake && navigator.wakeLock){ wake=await navigator.wakeLock.request("screen"); wake.addEventListener("release",()=>{ wake=null; }); }
    else if(!want && wake){ await wake.release(); wake=null; }
  }catch(e){ wake=null; }
}
document.addEventListener("visibilitychange", keepAwake);

/* ---------- navigation ---------- */
const VIEWS=["till","kitchen","pickup","sales","records","menu","inventory","ai","staff"];
const STAFF_VIEWS=["till","kitchen","pickup"];
const isMgr = () => !!(S.user && S.user.role==="manager");
const allowed = v => S.user ? (isMgr() || STAFF_VIEWS.includes(v)) : false;
document.querySelectorAll(".navbtn").forEach(b=>b.addEventListener("click",()=>show(b.dataset.v)));
function setTitle(){ $("#viewTitle").textContent = t("title."+S.view); }
function show(v){
  if(!VIEWS.includes(v)) v="till";
  if(S.user && !allowed(v)) v="till";
  S.view=v;
  document.querySelectorAll(".navbtn").forEach(b=>{ if(b.dataset.v===v) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  document.querySelectorAll("section.view").forEach(s=>s.classList.toggle("on", s.id==="v-"+v));
  try{ if(location.hash!=="#"+v) history.replaceState(null,"","#"+v); }catch(e){}
  document.querySelectorAll(".navbtn").forEach(b=>{ b.hidden = !!S.user && !allowed(b.dataset.v); });
  local.write("kf_lastview", v);
  setTitle(); renderMbar(); renderBoard(); renderPickup(); keepAwake();
  if(v==="staff") renderStaff();
  renderInv();
  if(v==="ai"){ renderAi(); scrollAi(true); }
  if(typeof IA!=="undefined" && IA.open && v!=="inventory") closeIa();
  if(typeof AI!=="undefined" && AI.vm && v!=="ai") closeVoice();
}

/* ---------- menu tiles ---------- */
const activeMenu = () => S.menu.filter(m=>m.active!==false).sort((a,b)=>(a.order??0)-(b.order??0) || String(a.name).localeCompare(String(b.name)));
const qtyOf = id => S.cart.filter(l=>l.id===id).reduce((s,l)=>s+l.qty,0);
function renderTill(){
  const list = activeMenu();
  const cats = ["*", ...new Set(list.map(m=>m.cat||"—"))];
  if(!cats.includes(S.cat)) S.cat="*";
  $("#cats").innerHTML = cats.length>2 ? cats.map(c=>`<button class="chip" data-cat="${esc(c)}" aria-pressed="${c===S.cat}">${esc(c==="*"?t("all"):c)}</button>`).join("") : "";
  const shown = list.filter(m=>S.cat==="*" || (m.cat||"—")===S.cat);
  $("#tiles").classList.toggle("sold-mode", S.soldMode);
  $("#soldMode").hidden = S.readOnly;
  $("#soldMode").setAttribute("aria-pressed", String(S.soldMode));
  $("#soldMode").textContent = S.soldMode ? t("sold.done") : t("sold.mark");
  $("#tiles").innerHTML = shown.length ? shown.map(m=>{
    const q=qtyOf(m.id), p=priceFor(m,S.channel), opts=m.options;
    return `<button class="tile ${m.soldOut?"out":""} ${q&&!m.soldOut?"has":""}" data-id="${esc(m.id)}" aria-label="${esc(m.name)}${m.soldOut?" — "+esc(t("sold.badge")):""}">
      ${q&&!m.soldOut?`<span class="q ${S.bump===m.id?"pop":""}">${q}</span>`:""}${m.soldOut?`<span class="stamp">${esc(t("sold.badge"))}</span>`:""}
      <span><span class="n">${esc(m.name)}</span>${opts.length?`<span class="o">${esc(opts.join(" / "))}</span>`:""}</span>
      <span class="p">${S.channel!=="Kiosk"?`<s>${eur(m.price)}</s>`:""}${eur(p)}</span></button>`;
  }).join("") : !S.menuLoaded ? Array.from({length:8},()=>`<div class="tile skel" aria-hidden="true"><span class="sk1"></span><span class="sk2"></span></div>`).join("")
    : `<div class="empty" style="grid-column:1/-1"><b>${esc(t("empty.menu.t"))}</b>${esc(t("empty.menu.d"))}</div>`;
  renderTicket();
}
$("#cats").addEventListener("click",e=>{ const b=e.target.closest("[data-cat]"); if(!b) return; S.cat=b.dataset.cat; renderTill(); });
$("#soldMode").addEventListener("click",()=>{ S.soldMode=!S.soldMode; renderTill(); if(S.soldMode) toast(t("sold.hint")); });
$("#tiles").addEventListener("click",async e=>{
  const b=e.target.closest(".tile"); if(!b) return; const m=S.menu.find(x=>x.id===b.dataset.id); if(!m) return;
  if(S.soldMode){ if(S.readOnly) return; const was=!!m.soldOut; if(await guard(store.patchMenu(m.id, {soldOut:!was}))) toast(t(was?"sold.back":"sold.marked",{x:m.name}), undo(()=>guard(store.patchMenu(m.id,{soldOut:was})))); return; }
  if(m.soldOut){ toast(t("sold.toast",{x:m.name})); return; }
  if(m.options.length) openPicker(m); else addLine(m, "");
});
function addLine(m, option){
  const ex=S.cart.find(l=>l.id===m.id && l.option===option);
  if(ex) ex.qty++; else S.cart.push({id:m.id, option, qty:1});
  S.bump=m.id; renderTill(); S.bump=null;
  try{ navigator.vibrate && navigator.vibrate(8); }catch(e){}
}
let pickerReturn=null;
function openPicker(m){
  pickerReturn=document.activeElement;
  $("#pickTitle").textContent = m.name;
  $("#pickOpts").innerHTML = m.options.map(o=>`<button data-o="${esc(o)}">${esc(o)}</button>`).join("");
  $("#picker").dataset.id=m.id; $("#picker").hidden=false;
  setTimeout(()=>{ const f=$("#pickOpts button"); f&&f.focus(); },20);
}
function closePicker(){ $("#picker").hidden=true; if(pickerReturn&&pickerReturn.focus) try{ pickerReturn.focus(); }catch(e){} }
$("#pickOpts").addEventListener("click",e=>{ const b=e.target.closest("[data-o]"); if(!b) return; const m=S.menu.find(x=>x.id===$("#picker").dataset.id); closePicker(); if(m) addLine(m, b.dataset.o); });
$("#pickCancel").addEventListener("click",closePicker);
$("#picker").addEventListener("click",e=>{ if(e.target.id==="picker") closePicker(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !$("#picker").hidden) closePicker(); });

/* ---------- ticket ---------- */
function cartLines(){
  return S.cart.map(l=>{ const m=S.menu.find(x=>x.id===l.id); return m&&l.qty>0?{...l,name:m.name,price:priceFor(m,S.channel)}:null; }).filter(Boolean);
}
function calc(){
  const ls=cartLines(), sub=r2(ls.reduce((s,l)=>s+l.qty*l.price,0));
  const disc = S.channel!=="Kiosk" ? "none" : S.disc;
  let d=0, label="";
  if(disc==="10"||disc==="20"){ d=r2(sub*int(disc)/100); label=t("disc.pct",{p:disc}); }
  else if(disc==="staff"){ d=sub; label=t("staff"); }
  return { ls, sub, disc:d, discType:disc, label, total:r2(Math.max(0, sub-d)) };
}
const maxNum = list => list.reduce((mx,o)=>Math.max(mx,int(o.num)),0);
function renderQuickNotes(){
  $("#quickNotes").innerHTML = (S.settings.quickNotes||[]).map(n=>`<button data-n="${esc(n)}" aria-pressed="${S.notes.has(n)}">${esc(n)}</button>`).join("");
}
function renderTicket(){
  const {ls, sub, disc, label, total}=calc();
  const app = S.channel!=="Kiosk";
  $("#nextNo").textContent = "#"+(maxNum(S.today)+1);
  $("#lines").innerHTML = ls.length ? ls.map((l,ix)=>`<div class="line">
      <div class="stepper"><button data-dec="${ix}" aria-label="${esc(t("less"))}: ${esc(l.name)}">−</button><span class="num">${l.qty}</span><button data-inc="${ix}" aria-label="${esc(t("more"))}: ${esc(l.name)}">+</button></div>
      <span class="nm">${esc(l.name)}${l.option?`<i>${esc(l.option)}</i>`:""}</span><span class="num">${eur(l.qty*l.price)}</span></div>`).join("")
    : `<div class="hint" style="text-align:center;padding:8px 0">${esc(t("tap.items"))}</div>`;
  $("#subRow").hidden = !disc; $("#discRow").hidden = !disc;
  $("#subtotal").textContent = eur(sub); $("#discAmt").textContent = eur(-disc); $("#discLab").textContent = label;
  $("#total").textContent = eur(total);
  $("#placeBtn").disabled = !ls.length || !canTake() || S.placing;
  $("#placeBtn").textContent = S.readOnly ? t("viewonly") : S.connecting ? t("sync.wait") : !canTake() ? t("sync.off") : S.placing ? t("sending") : (ls.length ? t("place.sum",{x:eur(total)}) : t("place"));
  $("#chanHint").textContent = app ? t("app.prices",{x:chanLabel(S.channel)}) : "";
  $("#refFld").hidden = !app; $("#kioskRow").hidden = app; $("#discFld").hidden = app;
  const showCash = !app && S.pay==="Cash" && total>0;
  $("#cashFld").hidden = !showCash;
  if(showCash){
    const opts=[...new Set([Math.ceil(total), Math.ceil(total/5)*5, Math.ceil(total/10)*10, Math.ceil(total/20)*20, 50, 100].filter(v=>v>=total))].slice(0,4);
    $("#cashQuick").innerHTML = opts.map(v=>`<button data-cash="${v}">${eur(v)}</button>`).join("");
    const cash=num($("#cashIn").value);
    $("#changeOut").textContent = cash!==null ? (cash>=total ? t("change",{x:eur(cash-total)}) : t("short",{x:eur(total-cash)})) : "";
  }
  $("#repeatBtn").hidden = !S.lastOrder || ls.length>0 || S.readOnly;
  renderMbar();
}
$("#lines").addEventListener("click",e=>{
  const i=e.target.closest("[data-inc]"), d=e.target.closest("[data-dec]"); const ls=cartLines();
  const target = i ? ls[+i.dataset.inc] : d ? ls[+d.dataset.dec] : null; if(!target) return;
  const line=S.cart.find(l=>l.id===target.id && l.option===target.option); if(!line) return;
  line.qty += i ? 1 : -1; if(line.qty<=0) S.cart.splice(S.cart.indexOf(line),1);
  renderTill();
});
function segBind(sel, attr, key){ $(sel).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; S[key]=b.dataset[attr]; setSeg(sel,attr,S[key]); renderTill(); }); }
function setSeg(sel, attr, val){ $(sel).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", String(x.dataset[attr]===val))); }
segBind("#chanSeg","c","channel"); segBind("#paySeg","p","pay"); segBind("#dineSeg","d","dine"); segBind("#discSeg","k","disc");
$("#quickNotes").addEventListener("click",e=>{ const b=e.target.closest("[data-n]"); if(!b) return; const n=b.dataset.n; S.notes.has(n)?S.notes.delete(n):S.notes.add(n); renderQuickNotes(); });
$("#cashIn").addEventListener("input",renderTicket);
$("#cashQuick").addEventListener("click",e=>{ const b=e.target.closest("[data-cash]"); if(!b) return; $("#cashIn").value=b.dataset.cash; renderTicket(); });
function clearTicket(){
  S.cart=[]; S.notes.clear(); S.disc="none"; S.channel="Kiosk"; S.pay="Card"; S.dine="Takeaway";
  setSeg("#discSeg","k","none"); setSeg("#chanSeg","c","Kiosk"); setSeg("#paySeg","p","Card"); setSeg("#dineSeg","d","Takeaway");
  $("#noteIn").value=""; $("#cashIn").value=""; $("#refIn").value=""; renderQuickNotes(); renderTill();
}
$("#clearBtn").addEventListener("click",clearTicket);
$("#repeatBtn").addEventListener("click",()=>{
  const o=S.lastOrder; if(!o) return; let missing=0;
  S.cart=[]; items(o).forEach(i=>{ const m=S.menu.find(x=>x.name===i.name && x.active!==false && !x.soldOut); if(m) S.cart.push({id:m.id, option:i.option||"", qty:int(i.qty)||1}); else missing++; });
  S.channel=["Kiosk","Wolt","Bolt"].includes(o.channel)?o.channel:"Kiosk"; setSeg("#chanSeg","c",S.channel); renderTill();
  toast(missing ? t("repeat.miss",{n:missing}) : t("repeat.ok"));
});
$("#placeBtn").addEventListener("click",async()=>{
  if(S.placing || !canTake()) return;
  const {ls, sub, disc, discType, total}=calc(); if(!ls.length) return;
  S.placing=true; renderTicket();
  try{
    const app=S.channel!=="Kiosk", day=dayKey();
    const n=await store.claimNumber(day, maxNum(S.today));
    const note=[...S.notes, $("#noteIn").value.trim()].filter(Boolean).join(" · ").slice(0,300);
    const o={ num:n, day, createdAt:Date.now(), status:"new", channel:S.channel, payment: app?S.channel:S.pay,
      dine: app?"Delivery":S.dine, ref: app?$("#refIn").value.trim().slice(0,40):"", note,
      items: ls.map(l=>({name:l.name, option:l.option||"", qty:l.qty, price:l.price})),
      subtotal:sub, discount:disc, discountType:discType, total, staffId:S.user?S.user.id:"", staffName:S.user?S.user.name:"" };
    const cash=num($("#cashIn").value); if(!app && S.pay==="Cash" && cash!==null && total>0) o.cashGiven=r2(cash);
    if(await guard(store.addOrder(o))){ S.lastOrder=o; S.placing=false; clearTicket(); showDone(o); return; }
  }catch(e){ await guard(Promise.reject(e)); }
  S.placing=false; renderTicket();
});
let doneT=null;
function showDone(o){
  $("#doneNo").textContent = "#"+int(o.num);
  $("#doneTotal").textContent = eur(o.total);
  const ch = o.cashGiven!=null && o.cashGiven>=o.total ? r2(o.cashGiven-o.total) : null;
  $("#doneChangeRow").hidden = ch===null; if(ch!==null) $("#doneChange").textContent = eur(ch);
  $("#doneMeta").textContent = [chanLabel(o.channel), o.channel==="Kiosk"?payLabel(o.payment):"", o.channel==="Kiosk"?dineLabel(o.dine):"", tn("items", items(o).reduce((s,i)=>s+int(i.qty),0))].filter(Boolean).join(" · ");
  $("#done").hidden=false; setTimeout(()=>$("#doneOk").focus(),30);
  clearTimeout(doneT); doneT=setTimeout(hideDone, ch!==null ? 12000 : 6000);
}
function hideDone(){ clearTimeout(doneT); $("#done").hidden=true; }
$("#doneOk").addEventListener("click",hideDone);
$("#done").addEventListener("click",e=>{ if(e.target.id==="done") hideDone(); });
document.addEventListener("keydown",e=>{ if(!$("#done").hidden && (e.key==="Escape"||e.key==="Enter")){ e.preventDefault(); hideDone(); } });
function renderMbar(){
  const {ls,total}=calc(), n=ls.reduce((s,l)=>s+l.qty,0);
  $("#mbar").hidden = !(S.view==="till" && n>0);
  $("#mbCount").textContent = tn("items", n);
  $("#mbTotal").textContent = eur(total);
}
$("#mbGo").addEventListener("click",()=>$("#ticket").scrollIntoView({behavior:"smooth",block:"start"}));

/* ---------- kitchen ---------- */
const NEXT = { new:"preparing", preparing:"ready", ready:"done" };
let confirmCancel=null, seen=null; const freshIds=new Set();
const mins = o => Math.max(0, Math.floor((Date.now()-(Number(o.createdAt)||Date.now()))/60000));
function renderBoard(){
  const today = S.today;
  const open = today.filter(o=>o.status==="new"||o.status==="preparing");
  const agg={}; open.forEach(o=>items(o).forEach(i=>{ const k=itemLabel(i); agg[k]=(agg[k]||0)+int(i.qty); }));
  const aggList=Object.entries(agg).sort((a,b)=>b[1]-a[1]);
  $("#cooknow").innerHTML = `<span class="lab">${esc(t("cooknow"))}</span>${aggList.length?aggList.map(([k,q])=>`<span class="it"><b>${q}×</b>${esc(k)}</span>`).join(""):`<span class="muted">${esc(t("nothing"))}</span>`}
    <span class="tools"><button class="act ${S.sound?"acc":"lite"}" id="soundBtn" aria-pressed="${S.sound}">${esc(S.sound?t("sound.on"):t("sound.off"))}</button></span>`;
  ["new","preparing","ready"].forEach(st=>{
    const list = today.filter(o=>o.status===st).sort((a,b)=>a.createdAt-b.createdAt);
    $("#c-"+st).textContent = list.length;
    $("#s-"+st).innerHTML = list.length ? list.map(o=>{
      const m=mins(o), late = st!=="ready" ? m>=15 : m>=10, busy=S.pending.has(o.id);
      const tags=[`<span class="pill ${o.channel!=="Kiosk"?"app":""}">${esc(chanLabel(o.channel))}${o.ref?" "+esc(o.ref):""}</span>`];
      if(o.dine==="Eat in") tags.push(`<span class="pill eat">${esc(t("eatin"))}</span>`);
      return `<article class="card s-${st} ${freshIds.has(o.id)?"fresh":""}">
        <div class="hd"><span class="no">#${int(o.num)}</span>${tags.join("")}
          <span class="age ${late?"late":""}" data-c="${Number(o.createdAt)||0}" data-st="${st}" title="${esc(t("placedAt",{t:hm(o.createdAt)}))}">${esc(m<1?t("justnow"):t("min",{n:m}))}</span></div>
        <ul>${items(o).map(i=>`<li><b>${int(i.qty)}×</b><span>${esc(i.name)}${i.option?` <i>· ${esc(i.option)}</i>`:""}</span></li>`).join("")}</ul>
        ${o.note?`<div class="note">${esc(o.note)}</div>`:""}
        <div class="ft"><span class="sum">${eur(o.total)} · ${esc(payLabel(o.payment))}${o.discountType==="staff"?" · "+esc(t("staff.tag")):""}${o.staffName?" · "+esc(o.staffName):""}</span>
          ${S.readOnly?"":(confirmCancel===o.id
            ? `<button class="act warn" data-cancel="${esc(o.id)}">${esc(t("yescancel"))}</button><button class="act lite" data-keep>${esc(t("keep"))}</button>`
            : `${st!=="new"?`<button class="act lite" data-back="${esc(o.id)}" data-to="${st==="ready"?"preparing":"new"}" aria-label="${esc(t("back"))}" title="${esc(t("back"))}" ${busy?"disabled":""}>↩</button>`:""}<button class="act lite" data-askcancel="${esc(o.id)}">${esc(t("cancel"))}</button>${st==="ready" && o.payment==="Web" ? `<button class="act go" data-next="${esc(o.id)}" data-to="done" data-pay="Card" ${busy?"disabled":""}>${esc(t("web.paidCard"))}</button><button class="act go" data-next="${esc(o.id)}" data-to="done" data-pay="Cash" ${busy?"disabled":""}>${esc(t("web.paidCash"))}</button>` : `<button class="act ${st==="preparing"?"acc":"go"}" data-next="${esc(o.id)}" data-to="${NEXT[st]}" ${busy?"disabled":""}>${esc(t("next."+st))}</button>`}`)}
        </div></article>`;
    }).join("") : `<div class="empty">${esc(t(st==="new"?"emp.new":st==="preparing"?"emp.prep":"emp.ready"))}</div>`;
  });
  const openCount = today.filter(o=>isOpenStatus(o.status)).length;
  $("#activeBadge").hidden = !openCount; $("#activeBadge").textContent = openCount;
}
async function move(id, patch){
  if(S.pending.has(id)) return; S.pending.add(id); renderBoard();
  const ok=await guard(store.updateOrder(id, patch)); S.pending.delete(id); renderBoard(); return ok;
}
$("#v-kitchen").addEventListener("click",async e=>{
  const x=e.target;
  if(x.closest("#soundBtn")){ S.sound=!S.sound; if(S.sound) chime(); renderBoard(); return; }
  const n=x.closest("[data-next]"), bk=x.closest("[data-back]"), a=x.closest("[data-askcancel]"), c=x.closest("[data-cancel]"), k=x.closest("[data-keep]");
  if(n){ const patch={status:n.dataset.to}; patch[n.dataset.to+"At"]=Date.now(); if(n.dataset.pay) patch.payment=n.dataset.pay; move(n.dataset.next, patch); }
  else if(bk){ move(bk.dataset.back,{status:bk.dataset.to}); }
  else if(a){ confirmCancel=a.dataset.askcancel; renderBoard(); }
  else if(k){ confirmCancel=null; renderBoard(); }
  else if(c){ confirmCancel=null; const id=c.dataset.cancel, prev=(S.today.find(o=>o.id===id)||{}).status||"new";
    if(await move(id,{status:"cancelled",cancelledAt:Date.now()})) toast(t("cancelled"), undo(()=>move(id,{status:prev,cancelledAt:null}))); }
});

/* ---------- pickup screen ---------- */
$("#pSound").addEventListener("click",()=>{ S.sound=!S.sound; if(S.sound) chime(); renderPickup(); renderBoard(); });
function renderPickup(){
  $("#pSound").textContent = S.sound ? t("sound.on") : t("sound.off"); $("#pSound").setAttribute("aria-pressed", String(S.sound));
  const today=S.today;
  const prep=today.filter(o=>o.status==="new"||o.status==="preparing").sort((a,b)=>a.createdAt-b.createdAt);
  const ready=today.filter(o=>o.status==="ready").sort((a,b)=>(a.readyAt||0)-(b.readyAt||0));
  $("#pPrep").innerHTML = prep.length ? prep.map(o=>`<span>${int(o.num)}</span>`).join("") : `<span class="ph">${esc(t("p.ph1"))}</span>`;
  $("#pReady").innerHTML = ready.length ? ready.map(o=>`<span class="${readyPop.has(o.id)?"pop":""}">${int(o.num)}</span>`).join("") : `<span class="ph">${esc(t("p.ph2"))}</span>`;
}
$("#fsBtn").addEventListener("click",async()=>{
  try{ if(document.fullscreenElement) await document.exitFullscreen(); else await $("#screen").requestFullscreen(); }
  catch(e){ toast(t("fs.na")); }
});
document.addEventListener("fullscreenchange",()=>{ $("#fsBtn").textContent = document.fullscreenElement ? t("fs.exit") : t("fs"); });

/* ---------- sales + day close ---------- */
function bars(rows, money){
  const max=Math.max(1,...rows.map(r=>r[1]));
  return rows.length ? rows.map(([l,v,extra])=>`<div class="bar"><div class="t"><span>${esc(l)}</span><span>${money?eur(v):v}${extra?` · ${esc(extra)}`:""}</span></div><div class="track"><div class="fill" style="width:${(v/max*100).toFixed(1)}%"></div></div></div>`).join("")
    : `<div class="muted" style="font-size:.88rem">${esc(t("nosales"))}</div>`;
}
function niceMax(v){ if(v<=0) return 10; const p=Math.pow(10,Math.floor(Math.log10(v))); for(const m of [1,2,2.5,5,10]) if(m*p>=v) return m*p; return 10*p; }
function stats(list){
  const ok=list.filter(o=>o.status!=="cancelled");
  const sumBy=f=>r2(ok.filter(f).reduce((s,o)=>s+(Number(o.total)||0),0));
  const rev=sumBy(()=>true), card=sumBy(o=>o.payment==="Card"), cash=sumBy(o=>o.payment==="Cash"), app=r2(rev-card-cash);
  const vr=num(S.settings.vatRate)??24, vat=r2(rev*vr/(100+vr));
  const disc=r2(ok.reduce((s,o)=>s+(Number(o.discount)||0),0)), staff=ok.filter(o=>o.discountType==="staff").length;
  return {ok, rev, card, cash, app, vr, vat, net:r2(rev-vat), disc, staff, cancelled:list.length-ok.length};
}
function renderSales(){
  const st=stats(S.dayOrders), ok=st.ok;
  $("#k-rev").textContent=eur(st.rev); $("#k-vat").textContent=t("inclVat",{x:eur(st.vat),r:st.vr});
  const lw = S.lastWeek ? stats(S.lastWeek).rev : 0, cmp=$("#k-cmp");
  if(lw>0){ const pct=Math.round((st.rev-lw)/lw*100); let wd; try{ wd=new Date(startOf(minusDays(S.day,7))).toLocaleDateString(LOC[LANG],{weekday:"short",day:"numeric",month:"numeric"}); }catch(e){ wd=minusDays(S.day,7); }
    cmp.hidden=false; cmp.className="cmp "+(pct>=0?"up":"down"); cmp.textContent=t("vsLast",{p:(pct>0?"+":pct<0?"−":"")+Math.abs(pct)+"%",d:wd,x:eur(lw)}); }
  else cmp.hidden=true;
  $("#k-cnt").textContent=ok.length; $("#k-cnt2").textContent = ok.length ? t("kioskApp",{a:ok.filter(o=>o.channel==="Kiosk").length,b:ok.filter(o=>o.channel!=="Kiosk").length}) : "";
  $("#k-avg").textContent=eur(ok.length?st.rev/ok.length:0);
  const timed=ok.filter(o=>o.readyAt>o.createdAt); $("#k-time").textContent = timed.length ? t("min",{n:Math.round(timed.reduce((s,o)=>s+(o.readyAt-o.createdAt),0)/timed.length/60000)}) : "–";
  const hours=[]; for(let h=OPEN_H-1; h<=CLOSE_H; h++) hours.push(h);
  const byH={}; ok.forEach(o=>{ const h=new Date(o.createdAt).getHours(); byH[h]=(byH[h]||0)+(Number(o.total)||0); });
  const hs=[...new Set([...hours,...Object.keys(byH).map(Number)])].sort((a,b)=>a-b);
  const mx=niceMax(Math.max(0,...hs.map(h=>byH[h]||0)));
  $("#hours").innerHTML = `<div class="hours"><span></span><div><div class="hchart">
      ${[1,0.5].map(f=>`<div class="gl" style="bottom:${f*100}%"><span>${FMT.money0.format(Math.round(mx*f))}</span></div>`).join("")}
      ${hs.map(h=>{ const v=byH[h]||0; return `<div class="hb ${v?"":"zero"}" style="height:${(v/mx*100).toFixed(1)}%" title="${pad(h)}:00–${pad(h+1)}:00 · ${eur(v)}"></div>`; }).join("")}
    </div><div class="hlabels">${hs.map(h=>`<span>${h}</span>`).join("")}</div></div></div>`;
  const it={}; ok.forEach(o=>items(o).forEach(i=>{ const k=String(i.name); it[k]=it[k]||[0,0]; it[k][0]+=int(i.qty); it[k][1]+=int(i.qty)*(Number(i.price)||0); }));
  $("#topItems").innerHTML = bars(Object.entries(it).sort((a,b)=>b[1][0]-a[1][0]).slice(0,8).map(([n,[q,v]])=>[n,q,eur(v)]));
  const by={}; ok.forEach(o=>{ const k=o.channel==="Kiosk"?t("kiosk")+" · "+payLabel(o.payment):chanLabel(o.channel); by[k]=(by[k]||0)+(Number(o.total)||0); });
  $("#splits").innerHTML = bars(Object.entries(by).sort((a,b)=>b[1]-a[1]), true);
  const bs={}; ok.forEach(o=>{ const k=o.staffName||"—"; bs[k]=bs[k]||[0,0]; bs[k][0]+=Number(o.total)||0; bs[k][1]++; });
  $("#byStaff").innerHTML = bars(Object.entries(bs).sort((a,b)=>b[1][0]-a[1][0]).map(([n,[v,c]])=>[n,v,tn("ordersN",c)]), true);
  $("#dayNote").textContent = [S.day!==S.todayKey ? t("viewing",{d:dmy(startOf(S.day))}) : "", st.cancelled ? tn("cancelledN", st.cancelled) : ""].filter(Boolean).join(" ");
  renderClose(st);
}
function renderClose(st){
  st = st || stats(S.dayOrders);
  $("#z-card").textContent=eur(st.card); $("#z-cash").textContent=eur(st.cash); $("#z-app").textContent=eur(st.app);
  $("#z-net").textContent=eur(st.net); $("#z-vat").textContent=eur(st.vat); $("#z-vatl").textContent=t("vat",{r:st.vr});
  $("#z-disc").textContent=eur(st.disc); $("#z-staff").textContent = st.staff ? tn("staffN", st.staff) : "";
  const fl=num($("#zFloat").value)??0, cnt=num($("#zCount").value), exp=r2(fl+st.cash);
  $("#z-exp").textContent = t("expected",{x:eur(exp)});
  const d=$("#z-diff");
  if(cnt===null){ d.textContent="–"; d.className="v num diff"; }
  else { const df=r2(cnt-exp); d.textContent=signed(df); d.className="v num diff "+(Math.abs(df)<0.005?"ok":"bad"); }
  const rep=S.dayReport, open=S.dayOrders.filter(o=>isOpenStatus(o.status)).length;
  $("#zSave").disabled = S.readOnly;
  $("#zSave").textContent = rep ? t("close.update") : t("close.save");
  const changed = rep && Math.abs((Number(rep.revenue)||0)-st.rev)>0.009;
  $("#zNote").innerHTML = rep ? `<span class="diff ok">✓</span> ${esc(t("close.saved",{d:dmy(rep.closedAt),t:hm(rep.closedAt),r:eur(rep.revenue),c:signed(rep.cashDiff)}))}${changed?` <b style="color:var(--new)">${esc(t("close.changed"))}</b>`:""}`
    : (open ? `<span class="muted">${esc(tn("stillOpen", open))}</span>` : "");
}
["#zFloat","#zCount"].forEach(s=>$(s).addEventListener("input",()=>renderClose()));
$("#zSave").addEventListener("click",async()=>{
  const st=stats(S.dayOrders), fl=num($("#zFloat").value)??0, cnt=num($("#zCount").value);
  if(cnt===null){ toast(t("countFirst")); $("#zCount").focus(); return; }
  const exp=r2(fl+st.cash);
  const rep={ date:S.day, closedAt:Date.now(), orders:st.ok.length, cancelled:st.cancelled, revenue:st.rev, card:st.card, cash:st.cash, apps:st.app,
    vatRate:st.vr, vat:st.vat, net:st.net, discounts:st.disc, staffMeals:st.staff, cashFloat:r2(fl), cashCounted:r2(cnt), cashExpected:exp, cashDiff:r2(cnt-exp) };
  $("#zSave").disabled=true;
  if(await guard(store.setReport(S.day, rep))) toast(t("repSaved"));
  $("#zSave").disabled=S.readOnly;
});
$("#dayIn").addEventListener("change",()=>{ const v=$("#dayIn").value; if(!v) return; S.day=v; watchSalesDay(); });
const minusDays = (key,n) => { const d=new Date(startOf(key)); d.setDate(d.getDate()-n); return dayKey(d); };
function watchSalesDay(){
  store.subDayOrders(S.day, list=>{ S.dayOrders=list; renderSales(); });
  S.lastWeek=null; store.subLastWeek(minusDays(S.day,7), list=>{ S.lastWeek=list; renderSales(); });
  store.subReport(S.day, rep=>{ S.dayReport=rep;
    const busy = document.activeElement===$("#zFloat") || document.activeElement===$("#zCount");
    if(!busy){ $("#zFloat").value = rep && rep.cashFloat ? Number(rep.cashFloat).toFixed(2) : ""; $("#zCount").value = rep && rep.cashCounted!=null ? Number(rep.cashCounted).toFixed(2) : ""; }
    renderClose(); });
}
function watchToday(){ seen=null; readySeen=null; store.subToday(S.todayKey, onToday); }

/* ---------- records ---------- */
const R = { list:[], open:null, voidAsk:null };
function setQuick(q){
  const now=new Date(); let f=new Date(now), to=new Date(now);
  if(q==="yday"){ f.setDate(f.getDate()-1); to=new Date(f); }
  else if(q==="week"){ f.setDate(f.getDate()-6); }
  else if(q==="month"){ f=new Date(now.getFullYear(), now.getMonth(), 1); }
  $("#recFrom").value=dayKey(f); $("#recTo").value=dayKey(to);
  document.querySelectorAll("#recQuick .chip").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.q===q)));
  loadRange();
}
function loadRange(){
  let f=$("#recFrom").value, to=$("#recTo").value; if(!f||!to) return;
  if(f>to){ [f,to]=[to,f]; $("#recFrom").value=f; $("#recTo").value=to; }
  store.subRange(startOf(f), startOf(to)+86400000, list=>{ R.list=list; renderRecords(); });
}
$("#recQuick").addEventListener("click",e=>{ const b=e.target.closest("[data-q]"); if(b) setQuick(b.dataset.q); });
["#recFrom","#recTo"].forEach(s=>$(s).addEventListener("change",()=>{ document.querySelectorAll("#recQuick .chip").forEach(c=>c.setAttribute("aria-pressed","false")); loadRange(); }));
["#recSearch","#recChan","#recPay","#recStatus"].forEach(s=>$(s).addEventListener("input",renderRecords));
function filtered(){
  const q=$("#recSearch").value.trim().toLowerCase(), ch=$("#recChan").value, pay=$("#recPay").value, st=$("#recStatus").value;
  return [...R.list].sort((a,b)=>b.createdAt-a.createdAt).filter(o=>{
    if(ch && o.channel!==ch) return false;
    if(pay && o.payment!==pay) return false;
    if(st==="open" && !isOpenStatus(o.status)) return false;
    if(st && st!=="open" && o.status!==st) return false;
    if(q){ const hay=("#"+o.num+" "+(o.note||"")+" "+(o.ref||"")+" "+items(o).map(itemLabel).join(" ")).toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
}
function renderRecords(){
  const list=filtered(), st=stats(list);
  $("#recSum").innerHTML = `<span>${esc(t("s.orders"))} <b>${st.ok.length}</b></span><span>${esc(t("s.rev"))} <b>${eur(st.rev)}</b></span><span>${esc(t("card"))} <b>${eur(st.card)}</b></span><span>${esc(t("cash"))} <b>${eur(st.cash)}</b></span><span>Wolt + Bolt <b>${eur(st.app)}</b></span><span>${esc(t("s.vat"))} <b>${eur(st.vat)}</b></span>${st.cancelled?`<span>${esc(tn("cancelledN", st.cancelled))}</span>`:""}${R.list.length>=1000?`<span style="color:var(--new)">${esc(t("limit"))}</span>`:""}`;
  $("#recRows").innerHTML = list.length ? list.map(o=>{
    const row=`<tr class="row" data-rid="${esc(o.id)}" aria-expanded="${R.open===o.id}" tabindex="0"><td class="num">${dmy(o.createdAt)}</td><td class="num">${hm(o.createdAt)}</td><td class="num"><b>${int(o.num)}</b></td>
      <td class="items">${items(o).map(i=>int(i.qty)+"× "+esc(itemLabel(i))).join(", ")}</td><td>${esc(chanLabel(o.channel))}${o.ref?` <span class="muted">${esc(o.ref)}</span>`:""}</td><td>${esc(payLabel(o.payment))}</td>
      <td><span class="stat ${esc(o.status)}">${esc(stLabel(o.status))}</span></td><td class="r">${eur(o.total)}</td></tr>`;
    if(R.open!==o.id) return row;
    const wait = o.readyAt>o.createdAt ? t("d.wait",{n:Math.round((o.readyAt-o.createdAt)/60000)}) : "";
    const canVoid = !S.readOnly && o.status!=="cancelled";
    return row + `<tr class="detail"><td colspan="8"><div class="det">
      <div><table><thead><tr><th>${esc(t("d.item"))}</th><th class="r">${esc(t("d.qty"))}</th><th class="r">${esc(t("d.unit"))}</th><th class="r">${esc(t("d.line"))}</th></tr></thead><tbody>
        ${items(o).map(i=>`<tr><td>${esc(itemLabel(i))}</td><td class="r">${int(i.qty)}</td><td class="r">${eur(i.price)}</td><td class="r">${eur(int(i.qty)*(Number(i.price)||0))}</td></tr>`).join("")}
        ${o.discount?`<tr><td colspan="3">${esc(o.discountType==="staff"?t("staff"):t("disc.pct",{p:o.discountType}))}</td><td class="r">${eur(-o.discount)}</td></tr>`:""}
        <tr><td colspan="3"><b>${esc(t("th.total"))}</b></td><td class="r"><b>${eur(o.total)}</b></td></tr></tbody></table>
        ${o.note?`<div style="margin-top:10px;background:var(--accent-soft);border-radius:8px;padding:6px 9px">${esc(o.note)}</div>`:""}
        ${canVoid?`<div class="voidbox">${R.voidAsk===o.id?`<span>${esc(t("voidQ",{n:int(o.num)}))}</span><button class="act warn" data-void="${esc(o.id)}">${esc(t("voidYes"))}</button><button class="act lite" data-voidno>${esc(t("keep"))}</button>`:`<button class="act lite" data-voidask="${esc(o.id)}">${esc(t("void"))}</button>`}</div>`:""}</div>
      <div class="tl"><div><span>${hm(o.createdAt)}</span> ${esc(t("d.placed"))} · ${esc(chanLabel(o.channel))}, ${esc(payLabel(o.payment))}${o.dine?", "+esc(dineLabel(o.dine)):""}</div>
        ${o.staffName?`<div><span></span> ${esc(t("takenBy",{x:o.staffName}))}</div>`:""}
        ${o.cashGiven!=null?`<div><span></span> ${esc(t("d.cash",{a:eur(o.cashGiven),b:eur(o.cashGiven-o.total)}))}</div>`:""}
        ${o.preparingAt?`<div><span>${hm(o.preparingAt)}</span> ${esc(t("d.started"))}</div>`:""}
        ${o.readyAt?`<div><span>${hm(o.readyAt)}</span> ${esc(t("d.ready"))}</div>`:""}
        ${o.doneAt?`<div><span>${hm(o.doneAt)}</span> ${esc(t("d.collected"))}</div>`:""}
        ${o.cancelledAt?`<div><span>${hm(o.cancelledAt)}</span> ${esc(t(o.voided?"d.voided":"d.cancelled"))}</div>`:""}
        ${wait?`<div class="muted" style="margin-top:4px">${esc(wait)}</div>`:""}</div>
    </div></td></tr>`;
  }).join("") : `<tr><td colspan="8" class="muted" style="padding:18px">${esc(t("norows"))}</td></tr>`;
  $("#recExport").disabled = !list.length;
}
function toggleRow(r){ R.open = R.open===r.dataset.rid ? null : r.dataset.rid; R.voidAsk=null; renderRecords(); }
$("#recRows").addEventListener("click",async e=>{
  const va=e.target.closest("[data-voidask]"), v=e.target.closest("[data-void]"), vn=e.target.closest("[data-voidno]");
  if(va){ R.voidAsk=va.dataset.voidask; renderRecords(); return; }
  if(vn){ R.voidAsk=null; renderRecords(); return; }
  if(v){ R.voidAsk=null; const id=v.dataset.void, prev=(R.list.find(o=>o.id===id)||{}).status||"done";
    if(await guard(store.updateOrder(id,{status:"cancelled",voided:true,cancelledAt:Date.now()}))) toast(t("voided"), undo(()=>guard(store.updateOrder(id,{status:prev,voided:false,cancelledAt:null})))); return; }
  if(e.target.closest("tr.detail")) return;
  const r=e.target.closest("tr.row"); if(r) toggleRow(r);
});
$("#recRows").addEventListener("keydown",e=>{ const r=e.target.closest("tr.row"); if(r && e.target===r && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); toggleRow(r); } });
function csvKit(){
  const eu=$("#csvFmt").value==="eu", sep=eu?";":",";
  const cell=v=>{ let s=String(v??""); if(/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s="'"+s; return /[",;\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const money=n=>{ const s=r2(n).toFixed(2); return eu?s.replace(".",","):s; };
  const out=rows=>"﻿"+rows.map(r=>r.map(cell).join(sep)).join("\r\n");
  return {money,out};
}
function ordersCsv(){
  const {money,out}=csvKit();
  const rows=[T[LANG]["csv.orders"]];
  [...filtered()].reverse().forEach(o=>items(o).forEach((i,ix)=>rows.push([dmy(o.createdAt),hm(o.createdAt),int(o.num),chanLabel(o.channel),o.ref||"",payLabel(o.payment),dineLabel(o.dine),stLabel(o.status),i.name,i.option||"",int(i.qty),money(i.price),money(int(i.qty)*(Number(i.price)||0)),
    ix===0?money(o.discount||0):"", ix===0?money(o.total):"", ix===0?(o.note||""):"", ix===0?hm(o.readyAt):"", ix===0?hm(o.doneAt):"", ix===0?(o.staffName||""):""])));
  return out(rows);
}
async function saveCsv(name, data){
  const note=$("#recExportNote");
  let dl=null; try{ dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; }catch(e){}
  if(dl){ try{ await dl.save({filename:name,data}); note.textContent=t("f.saved",{f:name}); $("#recCsv").hidden=true; return; }
    catch(e){ if(e && e.code==="declined"){ note.textContent=t("f.cancel"); return; } if(e && e.code==="rate_limited"){ note.textContent=t("f.wait"); return; } } }
  const ta=$("#recCsv"); ta.value=data.replace(/^﻿/,""); ta.hidden=false; ta.select();
  try{ await navigator.clipboard.writeText(ta.value); note.textContent=t("f.copied"); }
  catch(e){ note.textContent=t("f.copy"); }
}
$("#recExport").addEventListener("click",()=>saveCsv("kingsfood-orders_"+$("#recFrom").value+"_"+$("#recTo").value+".csv", ordersCsv()));
$("#dayExport").addEventListener("click",async()=>{
  let days=[]; try{ days=await store.getDays($("#recFrom").value,$("#recTo").value); }catch(e){ toast(t("daysErr")); return; }
  if(!days.length){ $("#recExportNote").textContent=t("noDays"); return; }
  const {money,out}=csvKit();
  const rows=[T[LANG]["csv.days"]];
  days.sort((a,b)=>a.date<b.date?-1:1).forEach(d=>rows.push([d.date,int(d.orders),int(d.cancelled),money(d.revenue),money(d.card),money(d.cash),money(d.apps),d.vatRate,money(d.vat),money(d.net),money(d.discounts||0),int(d.staffMeals),money(d.cashFloat||0),money(d.cashExpected),money(d.cashCounted),money(d.cashDiff),dmy(d.closedAt)+" "+hm(d.closedAt)]));
  saveCsv("kingsfood-days_"+$("#recFrom").value+"_"+$("#recTo").value+".csv", out(rows));
});

/* ---------- menu editor ---------- */
const menuData = m => ({name:String(m.name||""), cat:m.cat||"", price:r2(m.price), order:m.order??0, active:m.active!==false, soldOut:!!m.soldOut, options:m.options||[], recipe:Array.isArray(m.recipe)?m.recipe:[]});
let delAsk=null;
function renderEditor(force){
  if(!force && $("#medit").contains(document.activeElement) && document.activeElement.tagName==="INPUT"){ S.editingMenu=true; return; }
  S.editingMenu=false;
  const list=[...S.menu].sort((a,b)=>(a.order??0)-(b.order??0) || String(a.name).localeCompare(String(b.name)));
  const ro = S.readOnly ? "disabled" : "";
  $("#medit").innerHTML = list.length ? list.map(m=>`<div class="mrow ${m.active===false?"off":""}" data-id="${esc(m.id)}">
      <input id="mn-${esc(m.id)}" value="${esc(m.name)}" data-f="name" maxlength="60" aria-label="${esc(t("m.item"))}" ${ro}>
      <input class="c" id="mc-${esc(m.id)}" value="${esc(m.cat||"")}" data-f="cat" maxlength="30" placeholder="${esc(t("m.cat"))}" aria-label="${esc(t("m.cat"))}" ${ro}>
      <input class="opt" id="mo-${esc(m.id)}" value="${esc(m.options.join(", "))}" data-f="options" placeholder="${esc(t("m.nochoice"))}" aria-label="${esc(t("m.sides"))}" ${ro}>
      <input class="price" id="mp-${esc(m.id)}" value="${r2(m.price).toFixed(2)}" data-f="price" inputmode="decimal" aria-label="${esc(t("m.price"))}" ${ro}>
      <button class="act lite" data-toggle ${ro}>${esc(m.active===false?t("m.show"):t("m.hide"))}</button>
      <button class="act warn" data-del ${ro}>${esc(delAsk===m.id?t("m.delete"):t("m.remove"))}</button>
    </div>`).join("") : `<div class="empty"><b>${esc(t("empty.menu.t"))}</b></div>`;
  $("#addItem").hidden = S.readOnly;
}
$("#medit").addEventListener("focusout",()=>{ setTimeout(()=>{ if(S.editingMenu && !$("#medit").contains(document.activeElement)) renderEditor(true); },0); });
$("#medit").addEventListener("change",async e=>{
  const inp=e.target.closest("input"); if(!inp) return; const row=inp.closest(".mrow"), m=S.menu.find(x=>x.id===row.dataset.id); if(!m) return;
  const f=inp.dataset.f, d={};
  if(f==="price"){ const v=num(inp.value); if(v===null||v<0||v>1000){ toast(t("t.price")); inp.value=r2(m.price).toFixed(2); return; } d.price=r2(v); inp.value=d.price.toFixed(2); }
  else if(f==="options") d.options=[...new Set(inp.value.split(",").map(s=>s.trim()).filter(Boolean))].slice(0,6);
  else if(f==="name"){ d.name=inp.value.trim(); if(!d.name){ toast(t("t.name")); inp.value=m.name; return; } }
  else if(f==="cat") d.cat=inp.value.trim();
  else return;
  if(await guard(store.patchMenu(m.id,d))) toast(t("t.saved"));
});
$("#medit").addEventListener("click",async e=>{
  const row=e.target.closest(".mrow"); if(!row) return; const m=S.menu.find(x=>x.id===row.dataset.id); if(!m) return;
  if(e.target.closest("[data-toggle]")) await guard(store.patchMenu(m.id,{active:m.active===false}));
  else if(e.target.closest("[data-del]")){ if(delAsk===m.id){ delAsk=null; if(await guard(store.delMenu(m.id))) toast(t("t.removed",{x:m.name})); } else { delAsk=m.id; renderEditor(true); } }
});
$("#addItem").addEventListener("click",async()=>{
  const id="m"+Date.now().toString(36), order=Math.max(0,...S.menu.map(m=>Number(m.order)||0))+1;
  if(await guard(store.setMenu(id,{name:t("m.new"),cat:"",price:0,order,active:true,soldOut:false,options:[]})))
    setTimeout(()=>{ const el=document.getElementById("mn-"+id); if(el){ el.focus(); el.select(); } },500);
});
function renderSettings(){
  if(document.activeElement!==$("#setVat")) $("#setVat").value = S.settings.vatRate ?? 24;
  if(document.activeElement!==$("#setNotes")) $("#setNotes").value = (S.settings.quickNotes||[]).join(", ");
  $("#setVat").disabled = $("#setNotes").disabled = S.readOnly;
}
$("#setVat").addEventListener("change",async()=>{ const v=num($("#setVat").value); if(v===null||v<0||v>50){ toast(t("t.vat")); renderSettings(); return; } if(await guard(store.setSettings({...S.settings, vatRate:r2(v)}))) toast(t("t.vatSaved")); });
$("#setNotes").addEventListener("change",async()=>{ const n=[...new Set($("#setNotes").value.split(",").map(s=>s.trim()).filter(Boolean))].slice(0,10); if(await guard(store.setSettings({...S.settings, quickNotes:n}))) toast(t("t.notesSaved")); });

/* ---------- staff portal ---------- */
const AUTOLOCK_MS=10*60000, KEEP_VIEWS=["kitchen","pickup"];
let lastAct=Date.now();
["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,()=>{ lastAct=Date.now(); if(S.user) local.write("kf_session",{id:S.user.id,last:lastAct}); },{passive:true}));
const initials = n => String(n||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"?";
const hex = buf => [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
async function hashPin(salt, pin){
  const data=new TextEncoder().encode("kingsfood:"+salt+":"+pin);
  if(window.crypto && crypto.subtle){ return hex(await crypto.subtle.digest("SHA-256", data)); }
  let h=2166136261; for(const b of data){ h^=b; h=Math.imul(h,16777619)>>>0; } return "f"+h.toString(16);
}
const newSalt = () => { const a=new Uint8Array(12); try{ crypto.getRandomValues(a); }catch(e){ for(let i=0;i<12;i++) a[i]=Math.random()*256|0; } return hex(a); };
const newId = p => p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
S.staff=[]; S.staffLoaded=false; S.shifts=[]; S.user=null; S.display=false;
const L2={ mode:"pick", pickId:null, pin:"", fails:0, until:0, err:"" };
const activeStaff = () => S.staff.filter(x=>x.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
const myShift = () => S.user ? S.shifts.find(x=>x.staffId===S.user.id && !x.out) : null;
const dur = ms => { const m=Math.max(0,Math.round(ms/60000)); return t("dur",{h:Math.floor(m/60),m:m%60}); };

const hasMgr = list => list.some(x=>x && x.name && x.role==="manager" && x.active!==false && (x.pinHash || x.hasPin));
function onStaff(list, meta){
  if(meta && meta.fromCache && !list.length) return;
  if(hasMgr(list)) S.mgrCheck=null;
  S.staffLoaded=true;
  S.staff=list.filter(x=>x && x.name).map(x=>({...x, role:x.role==="manager"?"manager":"staff"}));
  if(S.user){ const me=S.staff.find(x=>x.id===S.user.id && x.active!==false); if(!me) lock(); else S.user={id:me.id,name:me.name,role:me.role}; }
  else {
    const ses=local.read("kf_session",null), lv=local.read("kf_lastview","till");
    if(ses){ const me=S.staff.find(x=>x.id===ses.id && x.active!==false);
      if(me && (Date.now()-ses.last<AUTOLOCK_MS || KEEP_VIEWS.includes(lv)) && (!NET || (NET.session && NET.session.id===me.id))) signIn(me, true); }
  }
  renderLock(); renderUser(); if(S.view==="staff") renderStaff();
}
function onShifts(list){ S.shifts=list; renderUser(); if(S.view==="staff") renderShifts(); }
function signIn(member, silent){
  S.user={id:member.id,name:member.name,role:member.role};
  L2.mode="pick"; L2.pin=""; L2.err=""; L2.fails=0;
  local.write("kf_session",{id:member.id,last:Date.now()}); lastAct=Date.now();
  $("#lock").hidden=true; $("#userWrap").hidden=false;
  const lv=local.read("kf_lastview","till"); show(silent && allowed(lv) ? lv : (allowed(S.view)?S.view:"till"));
  renderUser(); renderTicket();
  if(!silent) toast(t("hello",{x:member.name}));
}
function lock(){
  S.user=null; try{ localStorage.removeItem("kf_session"); }catch(e){}
  if(NET) NET.logout();
  $("#userMenu").hidden=true; $("#userWrap").hidden=true; L2.mode="pick"; L2.pin=""; L2.err="";
  hideDone(); closePicker(); $("#lock").hidden=false; renderLock();
  if(typeof aiOnLock==="function") aiOnLock();
  if(typeof SC!=="undefined" && SC && SC.state!=="saving") closeScan();
}
$("#lockBtn").addEventListener("click",lock);
$("#userChip").addEventListener("click",e=>{ e.stopPropagation(); const m=$("#userMenu"); m.hidden=!m.hidden; $("#userChip").setAttribute("aria-expanded", String(!m.hidden)); });
document.addEventListener("click",e=>{ if(!e.target.closest("#userWrap")){ $("#userMenu").hidden=true; $("#userChip").setAttribute("aria-expanded","false"); } });
function renderUser(){
  if(!S.user) return;
  $("#uAv").textContent=initials(S.user.name); $("#uName").textContent=S.user.name; $("#uRole").textContent=t("role."+S.user.role);
  const sh=myShift(); $("#uShiftDot").className="sdot"+(sh?" on":"");
  $("#uShiftText").textContent = sh ? t("shift.on",{t:hm(sh.in)})+" · "+dur(Date.now()-sh.in) : t("shift.off");
  $("#shiftBtn").textContent = sh ? t("shift.end") : t("shift.start");
  $("#shiftBtn").disabled = S.readOnly || !(S.live||S.offlineOk);
}
$("#shiftBtn").addEventListener("click",async()=>{
  if(!S.user) return; const sh=myShift(); $("#userMenu").hidden=true;
  if(sh){ const out=Date.now(); if(await guard(store.patchDoc("shifts", sh.id, {out}))) toast(t("shift.ended",{h:dur(out-sh.in)})); }
  else { const now=Date.now(); if(await guard(store.setDoc("shifts", newId("sh"), {staffId:S.user.id, name:S.user.name, day:dayKey(), in:now, out:null}))) toast(t("shift.started",{t:hm(now)})); }
});

/* lock screen */
function renderLock(){
  const lk=$("#lock"); if(lk.hidden) return;
  const body=$("#lockBody");
  const lc=new Date(); $("#lockClock").textContent = pad(lc.getHours())+":"+pad(lc.getMinutes());
  if(S.connecting || !S.staffLoaded){ body.innerHTML=`<h2>${esc(t("lock.loading"))}</h2>`; return; }
  if(!S.live && !S.offlineOk){ body.innerHTML=`<h2>${esc(t("sync.off"))}</h2><p class="sub">${esc(t("offline"))}</p><button class="act lite" id="lockOffline">${esc(t("offline.btn"))}</button>`; return; }
  const act=activeStaff(), mgrs=act.filter(x=>x.role==="manager");
  if(!mgrs.length && db && S.mgrCheck!=="none"){
    if(S.mgrCheck!=="checking"){
      S.mgrCheck="checking";
      db.collection("staff").get().then(snap=>{ const list=docs(snap); if(hasMgr(list)){ S.mgrCheck=null; onStaff(list); } else { S.mgrCheck="none"; renderLock(); } })
        .catch(()=>{ S.mgrCheck=null; setTimeout(renderLock,2000); });
    }
    body.innerHTML=`<h2>${esc(t("lock.loading"))}</h2>`; return;
  }
  if(!mgrs.length){
    body.innerHTML=`<h2>${esc(t("lock.setupT"))}</h2><p class="sub">${esc(t("lock.noStaff"))}</p>
      <form class="setupform" id="setupForm" autocomplete="off">
        <label class="full">${esc(t("f.name"))}<input id="suName" maxlength="30" required></label>
        <label>${esc(t("f.pin"))}<input id="suPin" inputmode="numeric" maxlength="4" type="password" autocomplete="new-password" required></label>
        <label>${esc(t("f.pin2"))}<input id="suPin2" inputmode="numeric" maxlength="4" type="password" autocomplete="new-password" required></label>
        <div class="pinerr full" id="suErr" role="alert"></div>
        <button class="place" type="submit">${esc(t("lock.create"))}</button></form>`;
    return;
  }
  if(L2.mode==="pin"){
    const m=S.staff.find(x=>x.id===L2.pickId); if(!m){ L2.mode="pick"; return renderLock(); }
    const wait=Math.ceil((L2.until-Date.now())/1000);
    body.innerHTML=`<div class="pinwrap"><div class="pinwho"><span class="avatar">${esc(initials(m.name))}</span>${esc(m.name)}</div>
      <div class="pindots" id="pinDots" aria-label="${esc(t("lock.pin"))}">${[0,1,2,3].map(i=>`<i class="${i<L2.pin.length?"f":""}"></i>`).join("")}</div>
      <div class="pinerr" role="alert">${esc(wait>0?t("lock.wait",{n:wait}):L2.err)}</div>${DEMO && DEMO.pins[m.id]?`<div class="demohint">${esc(t("demo.pinIs",{p:DEMO.pins[m.id]}))}</div>`:""}
      <div class="pad" role="group" aria-label="${esc(t("lock.pin"))}">${[1,2,3,4,5,6,7,8,9].map(d=>`<button data-d="${d}">${d}</button>`).join("")}<button class="k" data-k="back">${esc(t("lock.back"))}</button><button data-d="0">0</button><button class="k" data-k="del" aria-label="Delete">⌫</button></div></div>`;
    return;
  }
  const shiftOn=new Set(S.shifts.filter(x=>!x.out).map(x=>x.staffId));
  body.innerHTML=`<h2>${esc(t("lock.who"))}</h2>${DEMO?`<p class="demohint">${esc(t("demo.pins"))}: ${act.map(m=>esc(m.name)+" · "+esc(DEMO.pins[m.id]||"")).join(" &nbsp; ")}</p>`:""}<div class="who">${act.map(m=>`<button data-sid="${esc(m.id)}"><span class="av">${esc(initials(m.name))}</span><span><span class="nm">${esc(m.name)}</span><span class="rl">${esc(t("role."+m.role))}</span></span>${shiftOn.has(m.id)?`<span class="on" title="${esc(t("shift.onShort"))}"></span>`:""}</button>`).join("")}</div>`;
}
$("#lockBody").addEventListener("click",async e=>{
  if(e.target.closest("#lockOffline")){ S.offlineOk=true; local.write("kf_offline_ok", true); setSync(); renderLock(); return; }
  const who=e.target.closest("[data-sid]"); if(who){ L2.mode="pin"; L2.pickId=who.dataset.sid; L2.pin=""; L2.err=""; renderLock(); return; }
  const k=e.target.closest("[data-k]"), d=e.target.closest("[data-d]");
  if(k){ if(k.dataset.k==="back"){ L2.mode="pick"; L2.pin=""; L2.err=""; } else L2.pin=L2.pin.slice(0,-1); renderLock(); return; }
  if(d) pinKey(d.dataset.d);
});
document.addEventListener("keydown",e=>{
  if($("#lock").hidden || L2.mode!=="pin" || e.target.closest("input")) return;
  if(/^[0-9]$/.test(e.key)){ e.preventDefault(); pinKey(e.key); }
  else if(e.key==="Backspace"){ e.preventDefault(); L2.pin=L2.pin.slice(0,-1); renderLock(); }
  else if(e.key==="Escape"){ L2.mode="pick"; L2.pin=""; renderLock(); }
});
async function pinKey(dg){
  if(Date.now()<L2.until || L2.pin.length>=4 || L2.busy) return;
  L2.pin+=dg; L2.err=""; renderLock();
  if(L2.pin.length<4) return;
  const m=S.staff.find(x=>x.id===L2.pickId); const pin=L2.pin;
  if(NET){
    L2.busy=true; const r=await NET.login(L2.pickId, pin); L2.busy=false;
    if(r.ok){ signIn({...m, ...r.member}); return; }
    L2.pin=""; L2.err=t(r.offline?"e.save":"lock.wrong");
    if(r.wait){ L2.until=Date.now()+r.wait*1000; const iv=setInterval(()=>{ if(Date.now()>=L2.until){ clearInterval(iv); L2.err=""; } renderLock(); },1000); }
    renderLock(); const dots=$("#pinDots"); if(dots) dots.classList.add("shake"); return;
  }
  const ok = m && m.active!==false && m.pinHash && (await hashPin(m.salt||"", pin))===m.pinHash;
  if(ok){ signIn(m); return; }
  L2.fails++; L2.pin=""; L2.err=t("lock.wrong");
  if(L2.fails>=5){ L2.until=Date.now()+30000; L2.fails=0; const iv=setInterval(()=>{ if(Date.now()>=L2.until){ clearInterval(iv); L2.err=""; } renderLock(); },1000); }
  renderLock(); const dots=$("#pinDots"); if(dots){ dots.classList.add("shake"); }
}
$("#lockBody").addEventListener("submit",async e=>{
  if(e.target.id!=="setupForm") return; e.preventDefault();
  const name=$("#suName").value.trim(), p1=$("#suPin").value.trim(), p2=$("#suPin2").value.trim(), err=$("#suErr");
  if(!name){ err.textContent=t("e.nameReq"); return; }
  if(!/^\d{4}$/.test(p1)){ err.textContent=t("e.pinFormat"); return; }
  if(p1!==p2){ err.textContent=t("e.pinMatch"); return; }
  if(NET){ const r=await NET.setup(name, p1); if(!r.ok){ err.textContent=t(r.error==="already_set_up"?"lock.loading":"e.save"); if(r.error==="already_set_up"){ S.mgrCheck=null; renderLock(); } return; }
    S.staff=[...S.staff.filter(x=>x.id!==r.member.id),{...r.member, active:true}]; S.staffLoaded=true; signIn(r.member); return; }
  if(db){ try{ const snap=await db.collection("staff").get(); if(hasMgr(docs(snap))){ S.mgrCheck=null; onStaff(docs(snap)); return; } }catch(x){ toast(t("e.save")); return; } }
  const id=newId("st"), salt=newSalt(), rec={name, role:"manager", salt, pinHash:await hashPin(salt,p1), active:true, createdAt:Date.now()};
  if(await guard(store.setDoc("staff", id, rec))){ S.staff=[...S.staff.filter(x=>x.id!==id),{id,...rec}]; signIn({id,...rec}); }
});
$("#displayBtn").addEventListener("click",()=>{ S.display=true; document.body.classList.add("display"); $("#lock").hidden=true; $("#dispExit").hidden=false; show("pickup"); });
$("#dispExit").addEventListener("click",()=>{ S.display=false; document.body.classList.remove("display"); $("#dispExit").hidden=true; lock(); });

/* staff management (managers) */
const SF={ mode:null, id:null };
function renderStaff(){
  if(!isMgr()) return;
  const me=S.user.id, onShift=new Set(S.shifts.filter(x=>!x.out).map(x=>x.staffId));
  const list=[...S.staff].sort((a,b)=>(a.active===false)-(b.active===false) || (a.role==="manager"?0:1)-(b.role==="manager"?0:1) || String(a.name).localeCompare(String(b.name)));
  $("#staffList").innerHTML = list.length ? list.map(m=>`<div class="srow ${m.active===false?"off":""}" data-id="${esc(m.id)}">
      <span class="avatar">${esc(initials(m.name))}</span>
      <span class="sn"><b>${esc(m.name)}${m.id===me?` <span class="muted">(${esc(t("staff.you"))})</span>`:""}</b><small>${esc(t("role."+m.role))}${m.active===false?" · "+esc(t("staff.inactive")):""}${onShift.has(m.id)?` · <span class="shrun">${esc(t("shift.onShort"))}</span>`:""}</small></span>
      ${S.readOnly?"":`<button class="act lite" data-edit>${esc(t("staff.edit"))}</button><button class="act lite" data-pin>${esc(t("staff.reset"))}</button><button class="act ${m.active===false?"lite":"warn"}" data-toggle ${m.id===me?"disabled":""}>${esc(m.active===false?t("staff.activate"):t("staff.deactivate"))}</button>`}
    </div>`).join("") : "";
  $("#staffAdd").hidden = S.readOnly || !!SF.mode;
  renderShifts();
}
function openForm(mode, id){
  SF.mode=mode; SF.id=id||null; const m=id?S.staff.find(x=>x.id===id):null;
  $("#sfTitle").textContent = mode==="add" ? t("staff.addTitle") : mode==="pin" ? t("staff.reset")+": "+(m?m.name:"") : t("staff.edit")+": "+(m?m.name:"");
  $("#sfNameRow").hidden = mode==="pin"; $("#sfRoleRow").hidden = mode==="pin";
  $("#sfPin").closest(".sfrow2").hidden = mode==="edit";
  $("#sfName").value = m?m.name:""; $("#sfRole").value = m?m.role:"staff"; $("#sfPin").value=""; $("#sfPin2").value=""; $("#sfErr").textContent="";
  $("#staffForm").hidden=false; $("#staffAdd").hidden=true;
  setTimeout(()=>{ (mode==="pin"?$("#sfPin"):$("#sfName")).focus(); },20);
}
function closeForm(){ SF.mode=null; SF.id=null; $("#staffForm").hidden=true; renderStaff(); }
$("#staffAdd").addEventListener("click",()=>openForm("add"));
$("#sfCancel").addEventListener("click",closeForm);
$("#staffList").addEventListener("click",async e=>{
  const row=e.target.closest(".srow"); if(!row) return; const id=row.dataset.id, m=S.staff.find(x=>x.id===id); if(!m) return;
  if(e.target.closest("[data-edit]")) openForm("edit", id);
  else if(e.target.closest("[data-pin]")) openForm("pin", id);
  else if(e.target.closest("[data-toggle]")){
    const deact = m.active!==false;
    if(deact && m.role==="manager" && activeStaff().filter(x=>x.role==="manager").length<=1){ toast(t("staff.lastMgr")); return; }
    if(await guard(store.patchDoc("staff", id, {active:!deact}))) toast(t("staff.saved"));
  }
});
$("#staffForm").addEventListener("submit",async e=>{
  e.preventDefault(); const err=$("#sfErr"); err.textContent="";
  const name=$("#sfName").value.trim(), role=$("#sfRole").value==="manager"?"manager":"staff", p1=$("#sfPin").value.trim(), p2=$("#sfPin2").value.trim();
  if(SF.mode!=="pin" && !name){ err.textContent=t("e.nameReq"); return; }
  if(SF.mode!=="edit"){ if(!/^\d{4}$/.test(p1)){ err.textContent=t("e.pinFormat"); return; } if(p1!==p2){ err.textContent=t("e.pinMatch"); return; } }
  if(SF.mode==="add"){
    const salt=newSalt(); if(await guard(store.setDoc("staff", newId("st"), {name, role, salt, pinHash:await hashPin(salt,p1), active:true, createdAt:Date.now()}))){ toast(t("staff.saved")); closeForm(); }
  } else if(SF.mode==="edit"){
    const m=S.staff.find(x=>x.id===SF.id); if(!m) return closeForm();
    if(m.role==="manager" && role!=="manager" && activeStaff().filter(x=>x.role==="manager").length<=1){ err.textContent=t("staff.lastMgr"); return; }
    if(await guard(store.patchDoc("staff", SF.id, {name, role}))){ toast(t("staff.saved")); closeForm(); }
  } else if(SF.mode==="pin"){
    const salt=newSalt(); if(await guard(store.patchDoc("staff", SF.id, {salt, pinHash:await hashPin(salt,p1)}))){ toast(t("staff.pinSaved")); closeForm(); }
  }
});

/* shift log */
const SH={ list:[] };
function setShQuick(q){
  const now=new Date(); let f=new Date(now); if(q==="week") f.setDate(f.getDate()-6); else f=new Date(now.getFullYear(), now.getMonth(), 1);
  $("#shFrom").value=dayKey(f); $("#shTo").value=dayKey(now);
  document.querySelectorAll("#shQuick .chip").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.q===q)));
  loadShifts();
}
function loadShifts(){
  let f=$("#shFrom").value, to=$("#shTo").value; if(!f||!to) return; if(f>to){ [f,to]=[to,f]; $("#shFrom").value=f; $("#shTo").value=to; }
  const a=startOf(f), b=startOf(to)+86400000;
  store.subColl("shRange","shifts", list=>{ SH.list=list.filter(x=>x.in>=a && x.in<b); renderShifts(); }, c=>c.where("in",">=",a).where("in","<",b));
}
$("#shQuick").addEventListener("click",e=>{ const b=e.target.closest("[data-q]"); if(b) setShQuick(b.dataset.q); });
["#shFrom","#shTo"].forEach(x=>$(x).addEventListener("change",()=>{ document.querySelectorAll("#shQuick .chip").forEach(c=>c.setAttribute("aria-pressed","false")); loadShifts(); }));
function renderShifts(){
  if(!isMgr()) return;
  const rows=[...SH.list].sort((a,b)=>b.in-a.in), tot={};
  rows.forEach(x=>{ const ms=(x.out||Date.now())-x.in; tot[x.name]=(tot[x.name]||0)+ms; });
  $("#shSum").innerHTML = Object.keys(tot).length ? Object.entries(tot).sort((a,b)=>b[1]-a[1]).map(([n,ms])=>`<span>${esc(n)} <b>${esc(dur(ms))}</b></span>`).join("") : "";
  $("#shRows").innerHTML = rows.length ? rows.map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${dmy(x.in)}</td><td class="num">${hm(x.in)}</td><td class="num">${x.out?hm(x.out):`<span class="shrun">${esc(t("shifts.open"))}</span>`}</td><td class="r">${esc(dur((x.out||Date.now())-x.in))}</td>
      <td>${!x.out && !S.readOnly?`<button class="act lite" data-endsh="${esc(x.id)}">${esc(t("shifts.endFor"))}</button>`:""}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted" style="padding:16px">${esc(t("shifts.none"))}</td></tr>`;
}
$("#shRows").addEventListener("click",async e=>{ const b=e.target.closest("[data-endsh]"); if(!b) return; if(await guard(store.patchDoc("shifts", b.dataset.endsh, {out:Date.now()}))) toast(t("staff.saved")); });
$("#shExport").addEventListener("click",()=>{
  const {money,out}=csvKit(); const rows=[T[LANG]["csv.shifts"]];
  [...SH.list].sort((a,b)=>a.in-b.in).forEach(x=>{ const h=((x.out||Date.now())-x.in)/3600000; rows.push([x.name, dmy(x.in), hm(x.in), x.out?hm(x.out):"", money(h)]); });
  saveCsv("kingsfood-shifts_"+$("#shFrom").value+"_"+$("#shTo").value+".csv", out(rows));
});

/*INV_MODULE*/
/*AI_MODULE*/
/* ---------- data flow ---------- */
function onMenu(list){
  S.menuLoaded=true;
  S.menu=list.filter(m=>m && m.name).map(m=>({...m, price:Number(m.price)||0, options:Array.isArray(m.options)?m.options.map(String).filter(Boolean):[]}));
  renderTill(); renderEditor(); renderInv();
}
function onSettings(d){ if(d && typeof d==="object") S.settings={...S.settings, ...d, quickNotes:Array.isArray(d.quickNotes)?d.quickNotes.map(String):S.settings.quickNotes}; renderQuickNotes(); renderSettings(); renderSales(); renderRecords(); }
let readySeen=null; const readyPop=new Set();
function onToday(list){
  if(seen){ const fresh=list.filter(o=>o.status==="new" && !seen.has(o.id)); if(fresh.length){ fresh.forEach(o=>freshIds.add(o.id)); if(S.view!=="pickup") chime(); setTimeout(()=>fresh.forEach(o=>freshIds.delete(o.id)),3000); } }
  seen=new Set(list.map(o=>o.id));
  const nowReady=list.filter(o=>o.status==="ready");
  if(readySeen){ const fr=nowReady.filter(o=>!readySeen.has(o.id)); if(fr.length){ fr.forEach(o=>readyPop.add(o.id)); if(S.view==="pickup") chime(); setTimeout(()=>{ fr.forEach(o=>readyPop.delete(o.id)); },4000); } }
  readySeen=new Set(nowReady.map(o=>o.id));
  S.today=list; renderBoard(); renderPickup(); renderTicket();
  if(!db) renderInv();
}
function renderAll(){ renderLock(); renderQuickNotes(); renderTill(); renderBoard(); renderPickup(); renderSales(); renderEditor(); renderRecords(); renderSettings(); renderInv(); renderAi(); }

function tick(){
  const d=new Date(), tm=pad(d.getHours())+":"+pad(d.getMinutes()), h=d.getHours();
  let dl; try{ dl=d.toLocaleDateString(LOC[LANG],{weekday:"short",day:"numeric",month:"short"}); }catch(e){ dl=dmy(d); }
  $("#clock").textContent = dl+" · "+tm;
  $("#ticketDate").textContent = dmy(d)+" · "+tm;
  $("#pClock").textContent = tm;
  $("#openPill").hidden = (h>=OPEN_H && h<CLOSE_H);
  if(dayKey()!==S.todayKey){
    const followSales = S.day===S.todayKey;
    S.todayKey=dayKey(); S.lastOrder=null; watchToday();
    if(followSales){ S.day=S.todayKey; $("#dayIn").value=S.day; watchSalesDay(); }
  }
  const aiBusy = typeof AI!=="undefined" && (AI.busy || AI.dictState!=="idle" || AI.ttsState!=="idle" || (typeof IA!=="undefined" && IA.busy));
  if(aiBusy) lastAct=Date.now();
  if(S.user && !KEEP_VIEWS.includes(S.view) && Date.now()-lastAct>AUTOLOCK_MS) lock();
  if(!$("#lock").hidden && L2.mode!=="pin") renderLock();
  if(S.user) renderUser();
  if(S.view==="kitchen") document.querySelectorAll("#v-kitchen .age[data-c]").forEach(el=>{
    const m=Math.max(0,Math.floor((Date.now()-Number(el.dataset.c))/60000)); el.textContent = m<1?t("justnow"):t("min",{n:m});
    el.classList.toggle("late", el.dataset.st!=="ready" ? m>=15 : m>=10); });
}
setInterval(tick, 20000);

async function start(){
  if(!DEMO){ try{ db = window.claude && window.claude.use ? await window.claude.use("db") : null; }catch(e){ db=null; } }
  S.live=!!db;
  if(db){ try{ USER=await window.claude.use("user"); const w=USER ? await USER.can("data.write") : null; if(w===false) S.readOnly=true; }catch(e){} }
  S.offlineOk = !db && local.read("kf_offline_ok", false)===true;
  S.connecting=false;
  setSync();
  store.subMenu(onMenu); store.subSettings(onSettings);
  store.subColl("staff","staff", onStaff);
  const since=Date.now()-3*86400000; store.subColl("shRecent","shifts", list=>onShifts(list.filter(x=>x.in>=since || !x.out)), c=>c.where("in",">=",since));
  setShQuick("week");
  store.subColl("inv","inv", onInvItems); store.subColl("invmoves","invmoves", onMoves); store.subColl("invoices","invoices", onInvoices);
  watchToday(); watchSalesDay(); setQuick("today");
  aiInit();
}
$("#dayIn").value=S.day; $("#recFrom").value=S.day; $("#recTo").value=S.day;
fmtInit();
const h0=(location.hash||"").replace("#",""); if(VIEWS.includes(h0)) S.view=h0;
show(S.view); applyLang();
window.addEventListener("hashchange",()=>{ const v=(location.hash||"").replace("#",""); if(VIEWS.includes(v) && v!==S.view) show(v); });
if(NET) window.addEventListener("kf:session-expired",()=>{ if(S.user){ lock(); toast(t("e.session")); } });
start();
})();
