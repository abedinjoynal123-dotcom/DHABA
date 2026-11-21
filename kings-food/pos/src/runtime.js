/* ---------- King's Food POS runtime for the website (Netlify) ----------
   The POS app talks to window.claude.use(name). Here those come from this
   site's own server (/api/pos/*) and the browser:
     db         shared data, synced by polling the server
     user       always allowed (permissions are enforced on the server)
     downloads  file downloads
     assets     invoice photos stored on the server
     sample     Claude, through /api/pos-ai (needs ANTHROPIC_API_KEY on Netlify)
     tts        the browser's own speech (speechSynthesis)
     dictation  the browser's speech recognition (Chrome, Edge, Safari)
*/
(function(){
"use strict";
const API="/api/pos/";
const HDR={"content-type":"application/json","x-kf":"1"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,"0");
const dayOf=ms=>{ const d=new Date(ms); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const lang=()=>{ try{ const l=localStorage.getItem("kf_lang"); if(["et","en","ru"].includes(l)) return l; }catch(e){} const n=(navigator.language||"et").slice(0,2); return ["et","en","ru"].includes(n)?n:"et"; };
const tr=(k)=>{ try{ return (T[lang()]&&T[lang()][k])||T.en[k]||k; }catch(e){ return k; } };
const err=(code,extra)=>Object.assign(new Error(code),{code},extra||{});

async function call(path, body, method){
  let res;
  try{ res=await fetch(API+path,{method:method||(body===undefined?"GET":"POST"), headers:HDR, body:body===undefined?undefined:JSON.stringify(body), credentials:"same-origin", cache:"no-store"}); }
  catch(e){ throw err("unavailable"); }
  let data={}; try{ data=await res.json(); }catch(e){}
  if(res.status===401 && data.error==="not_paired"){ showPair(); throw err("unavailable"); }
  if(res.status===401 && data.error==="session"){ expired(); throw err("revoked"); }
  if(res.status===403) throw err("permission_denied");
  if(res.status===429) throw err("resource_exhausted");
  if(res.status>=500) throw err("unavailable");
  if(!res.ok) throw err(data.error==="not_found"?"not_found":"invalid_argument",{server:data.error});
  return data;
}

/* ---------- session ---------- */
const NET={ session:null, ai:false, booted:null };
let expiredSent=false;
function expired(){ NET.session=null; if(expiredSent) return; expiredSent=true; setTimeout(()=>{ expiredSent=false; },3000); window.dispatchEvent(new Event("kf:session-expired")); }
NET.login=async(id,pin)=>{
  try{ const r=await fetch(API+"login",{method:"POST",headers:HDR,body:JSON.stringify({id,pin}),credentials:"same-origin"}); const d=await r.json().catch(()=>({}));
    if(r.ok){ NET.session={id:d.member.id, role:d.member.role}; DB.kick(); return {ok:true, member:d.member}; }
    return {ok:false, wait:d.wait||0}; }catch(e){ return {ok:false, offline:true}; }
};
NET.setup=async(name,pin)=>{
  try{ const r=await fetch(API+"setup",{method:"POST",headers:HDR,body:JSON.stringify({name,pin}),credentials:"same-origin"}); const d=await r.json().catch(()=>({}));
    if(r.ok){ NET.session={id:d.member.id, role:d.member.role}; DB.kick(); return {ok:true, member:d.member}; }
    return {ok:false, error:d.error}; }catch(e){ return {ok:false, error:"offline"}; }
};
NET.logout=()=>{ NET.session=null; fetch(API+"logout",{method:"POST",headers:HDR,credentials:"same-origin"}).catch(()=>{}); DB.dropPrivate(); };
NET.number=async(day,floor)=>{ const d=await call("number",{day,floor}); return d.n; };
window.KF_NET=NET;

/* ---------- pairing screen ---------- */
let pairShown=false;
function showPair(){
  if(pairShown) return; pairShown=true;
  const el=document.createElement("div"); el.className="pairsheet"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
  el.innerHTML=`<form class="pairbox" autocomplete="off"><span class="logo" aria-hidden="true"></span><h2></h2><p class="sub"></p>
    <label><span></span><input type="password" inputmode="numeric" autocomplete="off" maxlength="40" required></label><p class="perr" role="alert"></p><button class="place" type="submit"></button></form>`;
  const fill=()=>{ el.querySelector("h2").textContent=tr("pair.title"); el.querySelector(".sub").textContent=tr("pair.text"); el.querySelector("label span").textContent=tr("pair.code"); el.querySelector("button").textContent=tr("pair.btn"); };
  fill(); document.body.appendChild(el); setTimeout(()=>el.querySelector("input").focus(),50);
  el.querySelector("form").addEventListener("submit",async e=>{
    e.preventDefault(); const b=el.querySelector("button"), pe=el.querySelector(".perr"); b.disabled=true; pe.textContent="";
    try{ const r=await fetch(API+"pair",{method:"POST",headers:HDR,body:JSON.stringify({code:el.querySelector("input").value.trim()}),credentials:"same-origin"}); const d=await r.json().catch(()=>({}));
      if(r.ok){ location.reload(); return; }
      pe.textContent=tr(d.error==="pair_locked"?"pair.locked":d.error==="not_configured"?"pair.off":"pair.wrong"); }
    catch(x){ pe.textContent=tr("pair.net"); }
    b.disabled=false; el.querySelector("input").select();
  });
}

/* ---------- db ---------- */
const PUBLIC=new Set(["c/menu","c/settings","c/staff"]);
const DB={ cache:new Map(), subs:new Set(), timer:null, busy:false, lastCold:new Map(), uid:0 };
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function collKey(c){ return c==="orders"?null:"c/"+c; }
function orderKeys(filters){
  const eq=filters.find(f=>f[0]==="day"&&f[1]==="=="); if(eq) return ["o/"+eq[2]];
  let from=null,to=null;
  for(const [f,op,v] of filters){ if(f!=="createdAt") continue; if(op===">="||op===">") from=Number(v); if(op==="<"||op==="<=") to=Number(v); }
  const end=to!=null?to-1:Date.now(); let start=from!=null?from:end-6*86400000;
  if(end-start>119*86400000) start=end-119*86400000;
  const keys=[]; const d=new Date(start); d.setHours(12,0,0,0);
  while(d.getTime()<=end+12*3600000 && keys.length<121){ keys.push("o/"+dayOf(d.getTime())); d.setDate(d.getDate()+1); }
  return keys;
}
const hot=k=>k.startsWith("c/") || k==="o/"+dayOf(Date.now()) || k==="o/"+dayOf(Date.now()-86400000);
function cmp(a,op,b){ return op==="=="?a===b:op===">="?a>=b:op===">"?a>b:op==="<"?a<b:op==="<="?a<=b:op==="!="?a!==b:false; }
function snapOf(q){
  if(q.doc){ const [c,id]=q.doc; const e=DB.cache.get(collKey(c)); const d=e&&e.docs&&e.docs[id]; return {exists:!!d, id, data:()=>clone(d)||undefined, metadata:{}}; }
  let list=[];
  for(const k of q.keys){ const e=DB.cache.get(k); if(e&&e.docs) for(const [id,d] of Object.entries(e.docs)) list.push({id,d}); }
  list=list.filter(({d})=>q.filters.every(([f,op,v])=>cmp(d[f],op,v)));
  if(q.order){ const [f,dir]=q.order; list.sort((a,b)=>{ const x=a.d[f], y=b.d[f]; return (x<y?-1:x>y?1:0)*(dir==="desc"?-1:1); }); }
  if(q.limit) list=list.slice(0,q.limit);
  const docs=list.map(({id,d})=>({id, data:()=>clone(d), exists:true}));
  return {docs, empty:!docs.length, size:docs.length, metadata:{fromCache:false, hasPendingWrites:false}};
}
async function fetchKeys(keys, force){
  const want={}; for(const k of keys){ const e=DB.cache.get(k); want[k]=force||!e?"":e.etag; }
  if(!Object.keys(want).length) return [];
  const d=await call("data",{keys:want});
  if(d.session===null && NET.session) expired();
  if(d.session) NET.session=d.session;
  const changed=[];
  for(const r of d.results||[]){
    if(r.same) continue;
    DB.cache.set(r.key,{etag:r.etag||"", docs:r.denied?{}:(r.docs||{}), denied:!!r.denied}); changed.push(r.key);
  }
  return changed;
}
function notify(changed){
  for(const s of DB.subs){ if(s.first || s.q.keys.some(k=>changed.includes(k))){ s.first=false; try{ s.cb(snapOf(s.q)); }catch(e){ console.error(e); } } }
}
async function poll(){
  if(DB.busy || !DB.subs.size) return; DB.busy=true;
  try{
    const now=Date.now(), keys=new Set();
    for(const s of DB.subs) for(const k of s.q.keys){ if(hot(k) || !DB.cache.has(k) || now-(DB.lastCold.get(k)||0)>60000){ keys.add(k); if(!hot(k)) DB.lastCold.set(k,now); } }
    const changed=await fetchKeys([...keys]);
    notify(changed);
  }catch(e){ if(e.code==="unavailable"||e.code==="resource_exhausted") for(const s of DB.subs) s.err&&s.err({code:"unavailable_quiet"}); }
  finally{ DB.busy=false; }
}
DB.kick=()=>{ for(const [k,e] of DB.cache) if(e.denied) DB.cache.delete(k); setTimeout(poll,0); };
DB.dropPrivate=()=>{ for(const k of [...DB.cache.keys()]) if(!PUBLIC.has(k) && !hot(k)) DB.cache.delete(k); };
// Order screens check often; other screens and hidden tabs much less (each check is one function call on Netlify).
function interval(){ if(document.visibilityState!=="visible") return 60000; return /^#(till|kitchen|pickup)?$/.test(location.hash||"") || document.body.classList.contains("display") ? 6000 : 15000; }
function schedule(){ clearTimeout(DB.timer); DB.timer=setTimeout(async()=>{ await poll(); schedule(); },interval()); }
window.addEventListener("hashchange",()=>{ if(/^#(till|kitchen|pickup)$/.test(location.hash)){ poll(); schedule(); } });
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") poll(); schedule(); });

function query(coll, filters, order, limit){
  const q={coll, filters, order, limit, keys: coll==="orders"?orderKeys(filters):[collKey(coll)]};
  return {
    where:(f,op,v)=>query(coll,[...filters,[f,op,v]],order,limit),
    orderBy:(f,dir)=>query(coll,filters,[f,dir||"asc"],limit),
    limit:n=>query(coll,filters,order,n),
    async get(){ await fetchKeys(q.keys.filter(k=>!DB.cache.has(k)||hot(k))); return snapOf(q); },
    onSnapshot(cb, errCb){ const s={q, cb, err:errCb?(e=>{ if(e.code!=="unavailable_quiet") errCb(e); }):null, first:true}; DB.subs.add(s);
      const have=q.keys.every(k=>DB.cache.has(k)); if(have){ s.first=false; setTimeout(()=>DB.subs.has(s)&&cb(snapOf(q)),0); } else setTimeout(poll,0);
      if(!DB.timer) schedule(); return ()=>DB.subs.delete(s); },
    doc:(id)=>docRef(coll, id),
  };
}
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function docRef(coll, id){
  let myId=id;
  const key=()=>coll==="orders"?"o/"+orderDayOf(myId):collKey(coll);
  const q={doc:[coll,null]};
  const write=async(op,data)=>{
    if(!myId){ if(coll==="orders"){ const day=(data&&data.day)||dayOf(Date.now()); myId="o"+day.replace(/-/g,"")+"_"+rid(); } else myId=coll.slice(0,2)+rid(); }
    const k=key(); const e=DB.cache.get(k); let prev=null;
    if(e&&e.docs){ prev=e.docs[myId]; if(op==="delete") delete e.docs[myId]; else if(op==="set") e.docs[myId]=clone(data); else if(prev) e.docs[myId]={...prev,...clone(data)}; notify([k]); }
    try{ const d=await call("write",{ops:[{op,coll,id:myId,data}]}); for(const r of d.results||[]) if(!r.same&&!r.denied) DB.cache.set(r.key,{etag:r.etag,docs:r.docs||{}}); notify((d.results||[]).map(r=>r.key)); }
    catch(x){ if(e&&e.docs){ if(prev) e.docs[myId]=prev; else delete e.docs[myId]; e.etag=""; notify([k]); } throw x; }
  };
  return {
    get id(){ return myId; },
    set:d=>write("set",d), update:d=>write("update",d), delete:()=>write("delete"),
    async get(){ await fetchKeys([key()]); q.doc=[coll,myId]; return snapOf({doc:[coll,myId]}); },
    onSnapshot(cb, errCb){ return query(coll,[],null,null).onSnapshot(()=>cb(snapOf({doc:[coll,myId]})), errCb); },
  };
}
function orderDayOf(id){ let m=/^o(\d{4})(\d{2})(\d{2})_/.exec(id||""); if(m) return m[1]+"-"+m[2]+"-"+m[3]; m=/^w(\d{4}-\d{2}-\d{2})-/.exec(id||""); return m?m[1]:dayOf(Date.now()); }
const db={
  collection:c=>query(c,[],null,null),
  doc(path){ const [c,id]=String(path).split("/"); return docRef(c,id); },
};

/* ---------- downloads ---------- */
const downloads={ async save({filename,data,mimeType}){ const blob=data instanceof Blob?data:new Blob([data],{type:mimeType||(String(filename).endsWith(".csv")?"text/csv;charset=utf-8":"application/octet-stream")});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename||"download"; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500); return {saved:true}; } };

/* ---------- assets ---------- */
const assets={ async upload(blob){ let r; try{ r=await fetch(API+"asset",{method:"POST",headers:{"content-type":blob.type||"image/jpeg","x-kf":"1"},body:blob,credentials:"same-origin"}); }catch(e){ throw err("unavailable"); }
  const d=await r.json().catch(()=>({})); if(!r.ok) throw err(d.error||"upstream_error"); return d; } };

/* ---------- Claude ---------- */
const IMG_TYPES=["image/jpeg","image/png","image/webp","image/gif"];
async function toImageBlock(blob){
  let b=blob;
  try{ const bmp=await createImageBitmap(blob); const k=Math.min(1,1568/Math.max(bmp.width,bmp.height));
    if(k<1 || !IMG_TYPES.includes(blob.type) || blob.size>3.5e6){ const c=document.createElement("canvas"); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k); c.getContext("2d").drawImage(bmp,0,0,c.width,c.height); b=await new Promise((res,rej)=>c.toBlob(x=>x?res(x):rej(err("image_rejected")),"image/jpeg",0.85)); } }
  catch(e){ if(!IMG_TYPES.includes(blob.type)) throw err("image_rejected"); }
  const data=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(",")[1]); fr.onerror=()=>rej(err("image_rejected")); fr.readAsDataURL(b); });
  return {type:"image", source:{type:"base64", media_type:b.type||"image/jpeg", data}};
}
async function runJob(request, signal){
  const job="j"+rid()+rid();
  let r; try{ r=await fetch("/api/pos-ai",{method:"POST",headers:HDR,body:JSON.stringify({job,request}),credentials:"same-origin",signal}); }
  catch(e){ if(signal&&signal.aborted) throw err("cancelled"); throw err("upstream_error"); }
  if(r.status===413) throw err("prompt_too_large");
  if(!r.ok && r.status!==202) throw err(r.status===404?"sampling_disabled":"upstream_error");
  const t0=Date.now();
  while(Date.now()-t0<180000){
    if(signal&&signal.aborted) throw err("cancelled");
    await sleep(Date.now()-t0<6000?900:1600);
    let d; try{ d=await call("ai/"+job); }catch(e){ if(e.code==="permission_denied") throw err("not_granted"); if(e.code==="revoked") throw err("session_expired"); continue; }
    if(d.done){ if(d.error) throw err(d.error==="not_configured"?"sampling_disabled":d.error); return d.result; }
  }
  throw err("upstream_error");
}
function textOf(content){ return (content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim(); }
async function sample(input, opts){
  opts=opts||{};
  const signal=opts.signal;
  if(signal&&signal.aborted) throw err("cancelled");
  let msgs=typeof input==="string"?[{role:"user",content:input}]:input.map(m=>({role:m.role,content:m.content}));
  // The first user turn of the POS prompts carries the instructions: send it as the system prompt.
  let system="";
  if(msgs.length>1 && msgs[0].role==="user"){ system=msgs[0].content; msgs=msgs.slice(1); }
  while(msgs.length && msgs[0].role!=="user") msgs.shift();
  // Merge consecutive turns of the same role (the API needs alternation).
  const merged=[]; for(const m of msgs){ const last=merged[merged.length-1]; if(last&&last.role===m.role) last.content+="\n\n"+m.content; else merged.push({...m}); }
  msgs=merged.map(m=>({role:m.role, content:[{type:"text", text:String(m.content||" ")}]}));
  if(opts.images){ const list=Array.from(opts.images instanceof Blob?[opts.images]:opts.images).slice(0,5); const blocks=[]; for(const b of list) blocks.push(await toImageBlock(b)); msgs[msgs.length-1].content=[...blocks,...msgs[msgs.length-1].content]; }
  const tools=(opts.tools||[]).map(t=>({name:t.name, description:t.description||"", input_schema:t.inputSchema||{type:"object",properties:{}}}));
  for(let step=0; step<10; step++){
    const res=await runJob({system, messages:msgs, tools, max_tokens:opts.maxTokens||4000}, signal);
    if(res.stop_reason==="refusal") throw err("refused");
    const text=textOf(res.content);
    if(res.stop_reason==="tool_use" && tools.length){
      msgs.push({role:"assistant", content:res.content});
      const results=[];
      for(const b of res.content.filter(x=>x.type==="tool_use")){
        const tool=(opts.tools||[]).find(t=>t.name===b.name);
        try{ if(!tool) throw new Error("Unknown tool"); const out=await tool.execute(b.input||{}); let s=JSON.stringify(out===undefined?{done:true}:out); if(s.length>60000) s=s.slice(0,60000)+"…(truncated)"; results.push({type:"tool_result", tool_use_id:b.id, content:s}); }
        catch(e){ results.push({type:"tool_result", tool_use_id:b.id, content:String(e&&e.message||e), is_error:true}); }
      }
      msgs.push({role:"user", content:results});
      if(text && opts.onText) opts.onText({text, delta:text});
      continue;
    }
    if(!text) throw err("empty_completion");
    if(opts.onText) opts.onText({text, delta:text});
    return {text, truncated:res.stop_reason==="max_tokens"};
  }
  throw err("upstream_error");
}
sample.json=async(input, opts)=>{
  const prompt=(typeof input==="string"?input:input.map(m=>m.content).join("\n\n"))+"\n\nReply with only the JSON, no other text.";
  const r=await sample(prompt,{...(opts||{}), maxTokens:8000});
  const s=r.text.replace(/^```(?:json)?\s*|\s*```$/g,""); const a=s.indexOf("{"), b=s.lastIndexOf("}");
  try{ return JSON.parse(a>=0&&b>a?s.slice(a,b+1):s); }catch(e){ throw err("invalid_json",{text:r.text}); }
};
sample.limits=async()=>({maxPromptBytes:5000000, tools:{maxCount:20}, images:{maxCount:5, maxInputBytes:20000000, mediaTypes:IMG_TYPES}});

/* ---------- speech out ---------- */
function makeTts(){
  const S=window.speechSynthesis; if(!S || typeof SpeechSynthesisUtterance==="undefined") return null;
  const L=[]; let state="idle", rate=1, rejectAll=null;
  const set=(st,reason)=>{ state=st; L.forEach(f=>{ try{ f({state:st, reason}); }catch(e){} }); };
  const MOOD={buttery:{pitch:1}, airy:{pitch:1.2}, glassy:{pitch:1.05, rate:1.05}, rounded:{pitch:0.85, rate:0.95}};
  const LOCALE={et:"et",en:"en",ru:"ru"};
  const pickVoice=()=>{ const vs=S.getVoices()||[], l=LOCALE[lang()]; return vs.find(v=>v.lang&&v.lang.toLowerCase().startsWith(l)&&/natural|neural|google|premium/i.test(v.name)) || vs.find(v=>v.lang&&v.lang.toLowerCase().startsWith(l)) || null; };
  return {
    speak(x, o){ o=o||{}; const lines=(typeof x==="string"?[{text:x}]:x).filter(l=>l&&l.text);
      S.cancel(); if(rejectAll){ rejectAll(); rejectAll=null; }
      if(!lines.length) return Promise.resolve();
      rate=Math.min(1.5,Math.max(0.7,Number(o.rate)||rate||1));
      return new Promise((res,rej)=>{
        let stopped=false; rejectAll=()=>{ stopped=true; rej(err("viewer_stopped")); };
        const voice=pickVoice(); set("speaking");
        lines.forEach((l,i)=>{ const u=new SpeechSynthesisUtterance(String(l.text).slice(0,2000)); const m=MOOD[l.voice||o.voice]||MOOD.buttery;
          if(voice) u.voice=voice; u.lang=voice?voice.lang:({et:"et-EE",en:"en-GB",ru:"ru-RU"})[lang()]; u.pitch=m.pitch; u.rate=rate*(m.rate||1);
          if(i===lines.length-1){ u.onend=()=>{ if(stopped) return; rejectAll=null; set("idle","completed"); res(); }; }
          u.onerror=ev=>{ if(stopped) return; if(ev.error==="interrupted"||ev.error==="canceled") return; rejectAll=null; set("idle","upstream_error"); rej(err(ev.error==="not-allowed"?"no_gesture":"upstream_error")); };
          S.speak(u); });
      });
    },
    async stop(){ S.cancel(); if(rejectAll){ rejectAll(); rejectAll=null; } if(state!=="idle") set("idle","viewer_stopped"); },
    setRate(r){ rate=Number(r)||1; }, pause(){ S.pause(); set("paused"); }, resume(){ S.resume(); set("speaking"); },
    async add(lines){ return this.speak(lines); },
    onState(f){ L.push(f); return ()=>{ const i=L.indexOf(f); if(i>=0) L.splice(i,1); }; }, onLine(){ return ()=>{}; }, onPosition(){ return ()=>{}; },
  };
}

/* ---------- speech in ---------- */
function makeDictation(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return null;
  const P=[],F=[],ST=[]; let rec=null, state="idle", endWait=null, reason="stopped";
  const emit=(arr,v)=>arr.forEach(f=>{ try{ f(v); }catch(e){} });
  const set=(st,r)=>{ state=st; emit(ST, r?{state:st, reason:r}:{state:st}); };
  return {
    start(o){ o=o||{}; if(rec) return Promise.resolve();
      return new Promise((res,rej)=>{
        try{ rec=new SR(); }catch(e){ rej(err("unavailable")); return; }
        rec.lang=o.language||({et:"et-EE",en:"en-GB",ru:"ru-RU"})[lang()]; rec.continuous=true; rec.interimResults=true; reason="stopped";
        let started=false;
        rec.onstart=()=>{ started=true; set("listening"); res(); };
        rec.onresult=ev=>{ let interim=""; for(let i=ev.resultIndex;i<ev.results.length;i++){ const r=ev.results[i]; if(r.isFinal){ const tx=r[0].transcript; emit(F,{text:(tx.startsWith(" ")?"":" ")+tx}); } else interim+=r[0].transcript; } emit(P,{text:interim.trim()}); };
        rec.onerror=ev=>{ reason = ev.error==="not-allowed"||ev.error==="service-not-allowed" ? "not_granted" : ev.error==="no-speech"||ev.error==="aborted" ? reason : "upstream_error"; if(!started){ rec=null; set("idle",reason); rej(err(reason==="not_granted"?"not_granted":"unavailable")); } };
        rec.onend=()=>{ rec=null; emit(P,{text:""}); set("idle",reason); if(endWait){ endWait(); endWait=null; } };
        set("starting");
        try{ rec.start(); }catch(e){ rec=null; set("idle","upstream_error"); rej(err("unavailable")); }
      });
    },
    stop(){ if(!rec) return Promise.resolve(); set("finishing"); reason="stopped"; return new Promise(r=>{ endWait=r; try{ rec.stop(); }catch(e){ r(); } }); },
    active(){ return !!rec; },
    onPartial(f){ P.push(f); return ()=>{}; }, onFinal(f){ F.push(f); return ()=>{}; }, onState(f){ ST.push(f); return ()=>{}; },
  };
}

/* ---------- boot ---------- */
let bootP=null;
function boot(){
  if(!bootP) bootP=(async()=>{
    for(let i=0;;i++){
      try{ const r=await fetch(API+"boot",{credentials:"same-origin",cache:"no-store"}); const d=await r.json().catch(()=>({}));
        if(r.status===503){ document.addEventListener("DOMContentLoaded",showPair); showPairOff(); return null; }
        if(d.paired===false){ if(document.body) showPair(); else document.addEventListener("DOMContentLoaded",showPair); return null; }
        if(r.ok){ NET.session=d.session; NET.ai=!!d.ai; NET.booted=d; return d; } }
      catch(e){}
      await sleep(Math.min(10000,1000*(i+1)));
    }
  })();
  return bootP;
}
function showPairOff(){ const go=()=>{ showPair(); const pe=document.querySelector(".pairsheet .perr"); if(pe) pe.textContent=tr("pair.off"); }; if(document.body) go(); else document.addEventListener("DOMContentLoaded",go); }
const user={ can:async()=>true, canEdit:async()=>NET.session&&NET.session.role==="manager", isOwner:async()=>false };
let ttsInst, dictInst;
window.claude={ use: async name=>{
  const b=await boot(); if(!b) return new Promise(()=>{}); // wait forever: the pairing screen is up
  switch(name){
    case "db": return db;
    case "user": return user;
    case "downloads": return downloads;
    case "assets": return assets;
    case "sample": return NET.ai ? sample : null;
    case "tts": if(ttsInst===undefined) ttsInst=makeTts(); return ttsInst;
    case "dictation": if(dictInst===undefined) dictInst=makeDictation(); return dictInst;
    default: return null;
  }
}};
boot();
})();
