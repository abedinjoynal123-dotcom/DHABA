/* ---------- inventory ---------- */
const UNITS=["kg","g","l","ml","pcs","pack","box"];
const uL = u => t("u."+(UNITS.includes(u)?u:"pcs"));
const r3 = n => Math.round((Number(n)||0)*1000)/1000;
let QF=null;
const fq = n => { if(!QF||QF.l!==LANG) QF={l:LANG,f:new Intl.NumberFormat(LOC[LANG],{maximumFractionDigits:2})}; return QF.f.format(r3(n)).replace("-","−"); };
const normTxt = s => String(s||"").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9Ѐ-ӿ]+/g," ").trim();
const unitFrom = s => { const x=normTxt(s); if(/^(kg|kilo)/.test(x)) return "kg"; if(/^(g|gr|gramm)/.test(x)) return "g"; if(/^(ml)/.test(x)) return "ml"; if(/^(l|ltr|liit|литр|л)$/.test(x)||/^l /.test(x)) return "l";
  if(/^(pk|pakk|pack|уп)/.test(x)) return "pack"; if(/^(kast|box|кор)/.test(x)) return "box"; return "pcs"; };
S.inv=[]; S.moves=[]; S.invoices=[]; S.invOrders=[]; S.invLoaded=false;
const IV={ tab:"stock", q:"", low:false, open:null, act:null, counting:false, form:null, recOpen:null, invOpen:null, invDel:null, sk:{} };
let invBase=null;

function onInvItems(list){
  S.inv=list.filter(x=>x && x.name).map(x=>({...x, unit:UNITS.includes(x.unit)?x.unit:"pcs", min:Number(x.min)||0, cost:Number(x.cost)||0, aliases:Array.isArray(x.aliases)?x.aliases:[]}));
  S.invLoaded=true; watchUsage(); renderInv();
}
function onMoves(list){ S.moves=list.filter(m=>m && m.itemId); watchUsage(); renderInv(); }
function onInvoices(list){ S.invoices=list.filter(Boolean).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)); renderInv(); }
function movesByItem(){ const m={}; for(const x of S.moves){ (m[x.itemId]=m[x.itemId]||[]).push(x); } for(const k in m) m[k].sort((a,b)=>a.at-b.at); return m; }
function baselineOf(item, list){
  list = list || S.moves.filter(m=>m.itemId===item.id); let last=null;
  for(const m of list) if(m.type==="count" && (!last || m.at>last.at)) last=m;
  return last ? {qty:Number(last.qty)||0, since:Number(last.at)||0, count:last} : {qty:0, since:Number(item.createdAt)||0, count:null};
}
function watchUsage(){
  if(!db || !S.inv.length) return;
  const mv=movesByItem();
  const b=Math.min(...S.inv.filter(x=>x.active!==false).map(x=>baselineOf(x, mv[x.id]||[]).since));
  if(!isFinite(b) || b===invBase) return;
  invBase=b;
  store.subColl("invOrders","orders", list=>{ S.invOrders=list; renderInv(); }, c=>c.where("createdAt",">=",b).orderBy("createdAt","desc").limit(3000));
}
const usageOrders = () => db ? S.invOrders : localOrders();
function usageIndex(){
  const byName={}; S.menu.forEach(m=>{ if(Array.isArray(m.recipe) && m.recipe.length) byName[m.name]=m.recipe; });
  const u={};
  for(const o of usageOrders()){
    if(!o || o.status==="cancelled") continue;
    for(const l of items(o)){ const rc=byName[l.name]; if(!rc) continue;
      for(const r of rc){ if(r.opt && r.opt!==(l.option||"")) continue; (u[r.itemId]=u[r.itemId]||[]).push([Number(o.createdAt)||0, (Number(r.qty)||0)*int(l.qty)]); } }
  }
  return u;
}
function computeStock(){
  const mv=movesByItem(), us=usageIndex(), out={};
  for(const it of S.inv){
    const list=mv[it.id]||[], b=baselineOf(it,list); let q=b.qty, inS=0, wS=0, uS=0;
    for(const m of list){ if(m.type==="count" || !(m.at>b.since)) continue; const v=Number(m.qty)||0;
      if(m.type==="waste"){ q-=Math.abs(v); wS+=Math.abs(v); } else { q+=v; if(m.type==="delivery") inS+=v; } }
    for(const [at,v] of (us[it.id]||[])) if(at>b.since){ q-=v; uS+=v; }
    q=r3(q);
    const st = q<=0 ? "out" : (it.min>0 && q<=it.min) ? "low" : "ok";
    out[it.id]={qty:q, base:b, inS:r3(inS), wS:r3(wS), uS:r3(uS), st, moves:list};
  }
  return out;
}
const staffName = id => (S.staff.find(x=>x.id===id)||{}).name||"";

function renderInv(){
  const sk=computeStock(); IV.sk=sk;
  const act=S.inv.filter(x=>x.active!==false);
  const low=act.filter(x=>sk[x.id] && sk[x.id].st!=="ok").length;
  const bd=$("#invBadge"); if(bd){ bd.hidden=!low || !isMgr(); bd.textContent=low; }
  if(S.view!=="inventory") return;
  const value=r2(act.reduce((s,x)=>s+Math.max(0,sk[x.id]?sk[x.id].qty:0)*x.cost,0));
  const since=Date.now()-30*86400000, buy=r2(S.invoices.filter(v=>(v.createdAt||0)>=since).reduce((s,v)=>s+(Number(v.total)||0),0));
  $("#ik-items").textContent=act.length; $("#ik-low").textContent=low; $("#ik-value").textContent=eur(value); $("#ik-buy").textContent=eur(buy);
  $("#ik-lowc").classList.toggle("warn", low>0);
  document.querySelectorAll("#invTabs [data-it]").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.it===IV.tab)));
  ["stock","invoices","recipes"].forEach(k=>{ $("#inv-"+k).hidden = IV.tab!==k; });
  $("#autoApply").checked=!!S.settings.autoApply;
  if(IV.tab==="stock") renderStock(); else if(IV.tab==="invoices") renderInvoices(); else renderRecipes();
}
$("#invTabs").addEventListener("click",e=>{ const b=e.target.closest("[data-it]"); if(!b) return; IV.tab=b.dataset.it; IV.open=null; IV.act=null; renderInv(); });

/* stock list */
function itemForm(it){
  const f=it||{name:"",unit:"kg",cat:"",min:0,cost:0,supplier:"",active:true};
  return `<form class="iform" id="itemForm" data-id="${esc(it?it.id:"")}" autocomplete="off">
    <label class="w2">${esc(t("inv.f.name"))}<input id="ifName" maxlength="60" value="${esc(f.name)}" required></label>
    <label>${esc(t("inv.f.unit"))}<select id="ifUnit">${UNITS.map(u=>`<option value="${u}" ${u===f.unit?"selected":""}>${esc(uL(u))}</option>`).join("")}</select></label>
    <label>${esc(t("inv.f.cat"))}<input id="ifCat" maxlength="30" value="${esc(f.cat||"")}" placeholder="${esc(t("inv.f.catPh"))}"></label>
    <label>${esc(t("inv.f.min"))}<input id="ifMin" inputmode="decimal" value="${f.min?esc(fq(f.min)):""}" placeholder="0"></label>
    <label>${esc(t("inv.f.cost"))}<input id="ifCost" inputmode="decimal" value="${f.cost?esc(String(r3(f.cost)).replace(".",LANG==="en"?".":",")):""}" placeholder="0,00"></label>
    <label class="w2">${esc(t("inv.f.supplier"))}<input id="ifSup" maxlength="60" value="${esc(f.supplier||"")}"></label>
    ${it?`<label class="chk"><input type="checkbox" id="ifActive" ${f.active!==false?"checked":""}> ${esc(t("inv.f.active"))}</label>`:""}
    <div class="ferr" id="ifErr" role="alert"></div>
    <div class="fbtns"><button class="act acc" type="submit">${esc(t("staff.save"))}</button><button class="act lite" type="button" data-cancelform>${esc(t("cancel"))}</button></div>
  </form>`;
}
function renderStock(){
  const sk=IV.sk, q=normTxt(IV.q), ro=S.readOnly;
  $("#invLowChip").setAttribute("aria-pressed", String(IV.low));
  $("#invCount").textContent = IV.counting ? t("inv.countCancel") : t("inv.count");
  $("#invAdd").hidden = ro || IV.counting; $("#invCount").hidden = ro || !S.inv.length;
  $("#invNewForm").innerHTML = IV.form==="new" ? itemForm(null) : "";
  let list=[...S.inv].filter(x=>x.active!==false || IV.showOff);
  if(q) list=list.filter(x=>normTxt(x.name+" "+(x.cat||"")+" "+(x.supplier||"")).includes(q));
  if(IV.low) list=list.filter(x=>sk[x.id] && sk[x.id].st!=="ok");
  const rank={out:0,low:1,ok:2};
  list.sort((a,b)=>(a.active===false)-(b.active===false) || rank[(sk[a.id]||{}).st||"ok"]-rank[(sk[b.id]||{}).st||"ok"] || String(a.cat||"").localeCompare(String(b.cat||"")) || String(a.name).localeCompare(String(b.name)));
  const head = IV.counting
    ? `<tr><th>${esc(t("inv.th.item"))}</th><th class="r">${esc(t("inv.th.expected"))}</th><th class="r">${esc(t("inv.th.counted"))}</th><th class="r">${esc(t("inv.th.diff"))}</th></tr>`
    : `<tr><th>${esc(t("inv.th.item"))}</th><th class="r">${esc(t("inv.th.onhand"))}</th><th class="r">${esc(t("inv.th.min"))}</th><th>${esc(t("status"))}</th><th class="r">${esc(t("inv.th.cost"))}</th><th class="r">${esc(t("inv.th.value"))}</th></tr>`;
  $("#invHead").innerHTML=head;
  if(!S.inv.length){
    $("#invRows").innerHTML=`<tr><td colspan="6"><div class="empty"><b>${esc(t("inv.empty.t"))}</b>${esc(t("inv.empty.d"))}</div></td></tr>`;
    $("#countBar").hidden=true; return;
  }
  $("#invRows").innerHTML = list.length ? list.map(it=>{
    const s=sk[it.id]||{qty:0,st:"ok"};
    if(IV.counting){
      const v=IV.countVals[it.id]; const n=num(v); const diff = n===null ? null : r3(n-s.qty);
      return `<tr><td><b>${esc(it.name)}</b>${it.cat?`<small class="muted"> · ${esc(it.cat)}</small>`:""}</td><td class="r">${esc(fq(s.qty))} ${esc(uL(it.unit))}</td>
        <td class="r"><input class="cnt" data-cid="${esc(it.id)}" inputmode="decimal" value="${esc(v||"")}" placeholder="${esc(fq(s.qty))}" aria-label="${esc(t("inv.th.counted"))}: ${esc(it.name)}"></td>
        <td class="r ${diff===null?"":diff<0?"neg":diff>0?"pos":""}" data-diff="${esc(it.id)}">${diff===null?"":(diff>0?"+":"")+esc(fq(diff))}</td></tr>`;
    }
    const open=IV.open===it.id;
    const row=`<tr class="row ${it.active===false?"off":""}" data-iid="${esc(it.id)}" tabindex="0" aria-expanded="${open}">
      <td><b>${esc(it.name)}</b>${it.cat?`<small class="muted"> · ${esc(it.cat)}</small>`:""}${it.supplier?`<small class="sup">${esc(it.supplier)}</small>`:""}</td>
      <td class="r qty ${s.st}">${esc(fq(s.qty))} <span class="u">${esc(uL(it.unit))}</span></td>
      <td class="r muted">${it.min?esc(fq(it.min)):"–"}</td>
      <td><span class="stat ${s.st==="ok"?"st-ok":s.st==="low"?"preparing":"new"}">${esc(t("inv.st."+s.st))}</span></td>
      <td class="r">${it.cost?eur(it.cost):"–"}</td>
      <td class="r">${it.cost?eur(Math.max(0,s.qty)*it.cost):"–"}</td></tr>`;
    if(!open) return row;
    return row+`<tr class="detail"><td colspan="6">${stockDetail(it,s)}</td></tr>`;
  }).join("") : `<tr><td colspan="6" class="muted" style="padding:18px">${esc(t("inv.none"))}</td></tr>`;
  $("#countBar").hidden=!IV.counting;
}
function stockDetail(it,s){
  const ro=S.readOnly, a=IV.act||"";
  const btns = ro ? "" : `<div class="iacts">
      <button class="act ${a==="delivery"?"acc":"lite"}" data-ia="delivery">${esc(t("inv.a.delivery"))}</button>
      <button class="act ${a==="waste"?"warn":"lite"}" data-ia="waste">${esc(t("inv.a.waste"))}</button>
      <button class="act ${a==="edit"?"go":"lite"}" data-ia="edit">${esc(t("staff.edit"))}</button></div>`;
  let form="";
  if(a==="delivery") form=`<form class="mform" id="mvForm" data-kind="delivery" autocomplete="off">
      <label>${esc(t("inv.m.qty"))} (${esc(uL(it.unit))})<input id="mvQty" inputmode="decimal" required></label>
      <label>${esc(t("inv.m.paid"))}<input id="mvCost" inputmode="decimal" placeholder="${esc(t("inv.m.optional"))}"></label>
      <label class="w2">${esc(t("inv.m.note"))}<input id="mvNote" maxlength="80" placeholder="${esc(it.supplier||"")}"></label>
      <div class="fbtns"><button class="act acc" type="submit">${esc(t("inv.m.addDelivery"))}</button></div></form>`;
  else if(a==="waste") form=`<form class="mform" id="mvForm" data-kind="waste" autocomplete="off">
      <label>${esc(t("inv.m.qty"))} (${esc(uL(it.unit))})<input id="mvQty" inputmode="decimal" required></label>
      <label>${esc(t("inv.m.reason"))}<select id="mvReason">${["spoiled","expired","dropped","staff","other"].map(r=>`<option value="${r}">${esc(t("inv.w."+r))}</option>`).join("")}</select></label>
      <label class="w2">${esc(t("inv.m.note"))}<input id="mvNote" maxlength="80"></label>
      <div class="fbtns"><button class="act warn" type="submit">${esc(t("inv.m.addWaste"))}</button></div></form>`;
  else if(a==="edit") form=itemForm(it);
  const hist=[...s.moves].sort((x,y)=>y.at-x.at).slice(0,12);
  const sinceTxt = s.base.count ? t("inv.h.sinceCount",{d:dmy(s.base.since)+" "+hm(s.base.since), q:fq(s.base.qty)+" "+uL(it.unit)}) : t("inv.h.sinceStart",{d:dmy(s.base.since||Date.now())});
  return `${btns}${form}<div class="ihist">
      <div class="isum"><span>${esc(sinceTxt)}</span><span>${esc(t("inv.h.in"))} <b>+${esc(fq(s.inS))}</b></span><span>${esc(t("inv.h.used"))} <b>−${esc(fq(s.uS))}</b></span><span>${esc(t("inv.h.waste"))} <b>−${esc(fq(s.wS))}</b></span></div>
      ${hist.length?`<table><tbody>${hist.map(m=>`<tr><td class="num">${dmy(m.at)} ${hm(m.at)}</td><td>${esc(t("inv.mt."+(m.type||"adjust")))}${m.reason?` · ${esc(t("inv.w."+m.reason))}`:""}</td>
        <td class="r num">${m.type==="count"?"= "+esc(fq(m.qty)):m.type==="waste"?"−"+esc(fq(Math.abs(m.qty))):(Number(m.qty)>=0?"+":"")+esc(fq(m.qty))}</td>
        <td class="muted">${esc(m.note||"")}${m.invoiceId?` <span class="pill">${esc(t("inv.fromInvoice"))}</span>`:""}</td><td class="muted">${esc(m.byName||staffName(m.by))}</td></tr>`).join("")}</tbody></table>`:`<p class="muted" style="margin:6px 0 0">${esc(t("inv.h.none"))}</p>`}
      ${!usageHasRecipe(it.id)?`<p class="hintline">${esc(t("inv.h.noRecipe"))}</p>`:""}
    </div>`;
}
const usageHasRecipe = id => S.menu.some(m=>Array.isArray(m.recipe) && m.recipe.some(r=>r.itemId===id));
$("#invSearch").addEventListener("input",e=>{ IV.q=e.target.value; renderStock(); });
$("#invLowChip").addEventListener("click",()=>{ IV.low=!IV.low; renderStock(); });
$("#invAdd").addEventListener("click",()=>{ IV.form="new"; IV.open=null; renderStock(); setTimeout(()=>{ const x=$("#ifName"); x&&x.focus(); },20); });
$("#invCount").addEventListener("click",()=>{ IV.counting=!IV.counting; IV.countVals={}; IV.open=null; IV.form=null; renderStock(); });
$("#invExport").addEventListener("click",()=>{
  const {money,out}=csvKit(), sk=IV.sk; const rows=[T[LANG]["csv.stock"]];
  S.inv.filter(x=>x.active!==false).forEach(x=>{ const s=sk[x.id]||{qty:0,st:"ok"}; rows.push([x.name,x.cat||"",uL(x.unit),String(r3(s.qty)).replace(".",$("#csvFmt").value==="eu"?",":"."),x.min||"",money(x.cost),money(Math.max(0,s.qty)*x.cost),t("inv.st."+s.st),x.supplier||""]); });
  saveCsv("kingsfood-stock_"+dayKey()+".csv", out(rows));
});
$("#invRows").addEventListener("click",e=>{
  if(e.target.closest("#mvForm") || e.target.closest("#itemForm")){ if(e.target.closest("[data-cancelform]")){ IV.act=null; renderStock(); } return; }
  const ia=e.target.closest("[data-ia]"); if(ia){ IV.act = IV.act===ia.dataset.ia ? null : ia.dataset.ia; renderStock(); setTimeout(()=>{ const x=$("#mvQty")||$("#ifName"); x&&x.focus(); },20); return; }
  if(e.target.closest("tr.detail")) return;
  const r=e.target.closest("tr.row"); if(!r) return;
  IV.open = IV.open===r.dataset.iid ? null : r.dataset.iid; IV.act=null; renderStock();
});
$("#invRows").addEventListener("keydown",e=>{ const r=e.target.closest("tr.row"); if(r && e.target===r && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); r.click(); } });
$("#invRows").addEventListener("input",e=>{
  const c=e.target.closest(".cnt"); if(!c) return; IV.countVals[c.dataset.cid]=c.value;
  const it=S.inv.find(x=>x.id===c.dataset.cid), s=IV.sk[c.dataset.cid], n=num(c.value), cell=document.querySelector(`[data-diff="${CSS.escape(c.dataset.cid)}"]`);
  if(cell && s){ const d=n===null?null:r3(n-s.qty); cell.textContent = d===null?"":(d>0?"+":"")+fq(d); cell.className="r "+(d===null?"":d<0?"neg":d>0?"pos":""); }
});
$("#countSave").addEventListener("click",async()=>{
  const now=Date.now(), entries=Object.entries(IV.countVals||{}).map(([id,v])=>[id,num(v)]).filter(([id,n])=>n!==null && n>=0 && S.inv.some(x=>x.id===id));
  if(!entries.length){ toast(t("inv.countEmpty")); return; }
  $("#countSave").disabled=true; let ok=0;
  for(const [id,n] of entries){ if(await guard(store.setDoc("invmoves", newId("mv"), {itemId:id, type:"count", qty:r3(n), at:now, by:S.user?S.user.id:"", byName:S.user?S.user.name:""}))) ok++; }
  $("#countSave").disabled=false; IV.counting=false; IV.countVals={}; renderStock(); toast(tn("inv.countSaved",ok));
});
document.addEventListener("submit",async e=>{
  const f=e.target;
  if(f.id==="itemForm"){
    e.preventDefault(); const err=$("#ifErr"); err.textContent="";
    const name=$("#ifName").value.trim(); if(!name){ err.textContent=t("e.nameReq"); return; }
    const min=num($("#ifMin").value), cost=num($("#ifCost").value);
    if(($("#ifMin").value && (min===null||min<0)) || ($("#ifCost").value && (cost===null||cost<0))){ err.textContent=t("inv.e.number"); return; }
    const d={name, unit:$("#ifUnit").value, cat:$("#ifCat").value.trim(), min:r3(min||0), cost:r3(cost||0), supplier:$("#ifSup").value.trim()};
    const id=f.dataset.id;
    if(id){ d.active = $("#ifActive") ? $("#ifActive").checked : true; if(await guard(store.patchDoc("inv", id, d))){ toast(t("staff.saved")); IV.act=null; renderStock(); } }
    else { const nid=newId("it"); if(await guard(store.setDoc("inv", nid, {...d, aliases:[], active:true, createdAt:Date.now()}))){ toast(t("inv.added",{x:name})); IV.form=null; IV.open=nid; renderStock(); } }
  }
  else if(f.id==="mvForm"){
    e.preventDefault(); const it=S.inv.find(x=>x.id===IV.open); if(!it) return;
    const q=num($("#mvQty").value); if(q===null || q<=0){ toast(t("inv.e.qty")); $("#mvQty").focus(); return; }
    const kind=f.dataset.kind, mv={itemId:it.id, type:kind, qty:r3(kind==="waste"?-q:q), at:Date.now(), by:S.user?S.user.id:"", byName:S.user?S.user.name:"", note:$("#mvNote").value.trim()};
    if(kind==="waste") mv.reason=$("#mvReason").value;
    let cost=null; if(kind==="delivery"){ const c=num($("#mvCost").value); if(c!==null && c>0){ cost=r3(c/q); mv.unitCost=cost; } }
    const id=newId("mv");
    if(await guard(store.setDoc("invmoves", id, mv))){
      if(cost!==null) await guard(store.patchDoc("inv", it.id, {cost}));
      IV.act=null; renderStock();
      toast(t(kind==="waste"?"inv.wasteSaved":"inv.deliverySaved",{q:fq(q)+" "+uL(it.unit), x:it.name}), undo(()=>guard(store.delDoc("invmoves", id))));
    }
  }
},true);
document.addEventListener("click",e=>{ if(e.target.closest("#invNewForm [data-cancelform]")){ IV.form=null; renderStock(); } });

/* invoices list */
function renderInvoices(){
  const ro=S.readOnly;
  $("#scanBtn2").hidden=ro; $("#manualBtn").hidden=ro;
  $("#invList").innerHTML = S.invoices.length ? S.invoices.map(v=>{
    const open=IV.invOpen===v.id, n=Array.isArray(v.lines)?v.lines.filter(l=>l.itemId).length:0;
    return `<article class="ivcard ${open?"open":""}" data-vid="${esc(v.id)}">
      <button class="ivhead" data-vtoggle>${v.photo?`<img class="ivthumb" src="${esc(assetUrl(v.photo))}" alt="" loading="lazy">`:`<span class="ivthumb ph" aria-hidden="true"></span>`}
        <span class="ivmain"><b>${esc(v.supplier||t("inv.v.unknown"))}</b><small>${esc(v.number?("№ "+v.number):"")}${v.date?" · "+esc(v.date.split("-").reverse().join(".")):""}</small></span>
        <span class="ivright"><b class="num">${eur(v.total)}</b><small>${esc(tn("inv.v.lines", n))}${v.auto?" · "+esc(t("inv.v.auto")):""}</small></span></button>
      ${open?`<div class="ivbody">
        ${ro?"":`<div class="ivacts">${IV.invDel===v.id?`<span class="ivq">${esc(t("inv.v.delQ"))}</span><button class="act warn" data-vdel="${esc(v.id)}">${esc(t("inv.v.delYes"))}</button><button class="act lite" data-vno>${esc(t("keep"))}</button>`
          :`<button class="act lite ivedit" data-vedit><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>${esc(t("inv.v.edit"))}</button><button class="act lite ivdelb" data-vask><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>${esc(t("inv.v.del"))}</button>`}</div>`}
        ${v.photo?`<a class="ivphoto" href="${esc(assetUrl(v.photo))}" target="_blank" rel="noopener"><img src="${esc(assetUrl(v.photo))}" alt="${esc(t("inv.v.photo"))}"></a>`:""}
        <div class="ivlines"><table><thead><tr><th>${esc(t("inv.r.line"))}</th><th class="r">${esc(t("d.qty"))}</th><th class="r">${esc(t("inv.r.amount"))}</th><th>${esc(t("inv.r.stock"))}</th></tr></thead><tbody>
          ${(v.lines||[]).map(l=>{ const it=S.inv.find(x=>x.id===l.itemId); return `<tr><td>${esc(l.text)}</td><td class="r">${esc(fq(l.qty))} ${esc(l.unit||"")}</td><td class="r">${l.lineTotal!=null?eur(l.lineTotal):"–"}</td>
            <td>${it?`+${esc(fq(l.stockQty))} ${esc(uL(it.unit))} ${esc(it.name)}`:`<span class="muted">${esc(t("inv.r.ignored"))}</span>`}</td></tr>`; }).join("")}
        </tbody></table>
        <p class="muted" style="font-size:.82rem;margin:8px 0 0">${esc(t("inv.v.added",{d:dmy(v.createdAt)+" "+hm(v.createdAt), x:v.byName||""}))}${v.editedAt?" · "+esc(t("inv.v.edited",{d:dmy(v.editedAt)+" "+hm(v.editedAt), x:v.editedByName||""})):""}</p>
        </div></div>`:""}
    </article>`;
  }).join("") : `<div class="empty"><b>${esc(t("inv.v.none.t"))}</b>${esc(t("inv.v.none.d"))}</div>`;
}
$("#invList").addEventListener("click",async e=>{
  const card=e.target.closest("[data-vid]"); if(!card) return; const id=card.dataset.vid;
  if(e.target.closest("[data-vtoggle]")){ IV.invOpen = IV.invOpen===id?null:id; IV.invDel=null; renderInvoices(); return; }
  if(e.target.closest("[data-vask]")){ IV.invDel=id; renderInvoices(); return; }
  if(e.target.closest("[data-vno]")){ IV.invDel=null; renderInvoices(); return; }
  if(e.target.closest("[data-vedit]")){ const v=S.invoices.find(x=>x.id===id); if(v) editInvoice(v); return; }
  if(e.target.closest("[data-vdel]")){
    const v=S.invoices.find(x=>x.id===id); if(!v) return; const snap=invSnapshot(v);
    for(const m of snap.moves) await guard(store.delDoc("invmoves", m.id));
    if(await guard(store.delDoc("invoices", id))){ IV.invDel=null; IV.invOpen=null; toast(t("inv.v.deleted"), undo(()=>restoreInvoice(snap))); }
  }
});
$("#autoApply").addEventListener("change",async e=>{ const v=e.target.checked; if(!(await guard(store.setSettings({...S.settings, autoApply:v})))) e.target.checked=!v; else toast(t(v?"inv.auto.on":"inv.auto.off")); });

/* recipes */
function recipeCost(m, opt){ return r2((m.recipe||[]).filter(r=>!r.opt || r.opt===opt).reduce((s,r)=>{ const it=S.inv.find(x=>x.id===r.itemId); return s+(it?it.cost*(Number(r.qty)||0):0); },0)); }
function renderRecipes(){
  const vr=num(S.settings.vatRate)??24, ro=S.readOnly;
  const menu=[...S.menu].filter(m=>m.active!==false).sort((a,b)=>(a.order??0)-(b.order??0));
  $("#recList").innerHTML = !S.inv.length ? `<div class="empty"><b>${esc(t("inv.rc.needItems.t"))}</b>${esc(t("inv.rc.needItems.d"))}</div>` : menu.map(m=>{
    const rc=Array.isArray(m.recipe)?m.recipe:[], opts=m.options||[], open=IV.recOpen===m.id;
    const costs = opts.length ? opts.map(o=>recipeCost(m,o)) : [recipeCost(m,"")];
    const lo=Math.min(...costs), hi=Math.max(...costs), net=m.price/(1+vr/100), pct = net>0 ? Math.round(hi/net*100) : 0;
    const costTxt = !rc.length ? t("inv.rc.none") : (lo===hi?eur(lo):eur(lo)+"–"+eur(hi));
    let body="";
    if(open){
      const draft=IV.recDraft;
      body=`<div class="rcbody">${draft.map((r,i)=>{ const it=S.inv.find(x=>x.id===r.itemId);
        return `<div class="rcrow" data-ri="${i}"><select data-rk="itemId" aria-label="${esc(t("inv.rc.ing"))}"><option value="">${esc(t("inv.rc.pick"))}</option>${S.inv.filter(x=>x.active!==false||x.id===r.itemId).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(x=>`<option value="${esc(x.id)}" ${x.id===r.itemId?"selected":""}>${esc(x.name)}</option>`).join("")}</select>
          <span class="rcq"><input data-rk="qty" inputmode="decimal" value="${r.qty!==""&&r.qty!=null?esc(String(r.qty).replace(".",LANG==="en"?".":",")):""}" placeholder="0" aria-label="${esc(t("inv.m.qty"))}"><span class="u">${it?esc(uL(it.unit)):""}</span></span>
          ${opts.length?`<select data-rk="opt" aria-label="${esc(t("inv.rc.when"))}"><option value="">${esc(t("inv.rc.always"))}</option>${opts.map(o=>`<option value="${esc(o)}" ${o===r.opt?"selected":""}>${esc(t("inv.rc.with",{x:o}))}</option>`).join("")}</select>`:""}
          <button class="act lite" data-rdel aria-label="${esc(t("m.remove"))}">✕</button></div>`; }).join("")}
        <div class="rcbtns"><button class="act lite" data-radd>${esc(t("inv.rc.add"))}</button><span class="sp"></span><button class="act acc" data-rsave>${esc(t("staff.save"))}</button><button class="act lite" data-rcancel>${esc(t("cancel"))}</button></div>
        <p class="hintline">${esc(t("inv.rc.hint"))}</p></div>`;
    }
    return `<article class="rccard ${open?"open":""}" data-mid="${esc(m.id)}">
      <button class="rchead" data-rtoggle ${ro?"disabled":""}><span class="rcname"><b>${esc(m.name)}</b><small>${esc(rc.length?tn("inv.rc.n", rc.length):t("inv.rc.notSet"))}</small></span>
        <span class="rcnums"><span><small>${esc(t("inv.rc.cost"))}</small><b>${esc(costTxt)}</b></span><span><small>${esc(t("inv.rc.price"))}</small><b>${eur(m.price)}</b></span>
        <span class="fc ${!rc.length?"":pct>35?"hi":pct>28?"mid":"ok"}"><small>${esc(t("inv.rc.fc"))}</small><b>${rc.length?pct+"%":"–"}</b></span></span></button>${body}</article>`;
  }).join("");
}
$("#recList").addEventListener("click",async e=>{
  const card=e.target.closest("[data-mid]"); if(!card) return; const m=S.menu.find(x=>x.id===card.dataset.mid); if(!m) return;
  if(e.target.closest("[data-rtoggle]")){ if(IV.recOpen===m.id){ IV.recOpen=null; } else { IV.recOpen=m.id; IV.recDraft=(Array.isArray(m.recipe)?m.recipe:[]).map(r=>({...r})); if(!IV.recDraft.length) IV.recDraft.push({itemId:"",qty:"",opt:""}); } renderRecipes(); return; }
  if(e.target.closest("[data-radd]")){ IV.recDraft.push({itemId:"",qty:"",opt:""}); renderRecipes(); return; }
  if(e.target.closest("[data-rcancel]")){ IV.recOpen=null; renderRecipes(); return; }
  const del=e.target.closest("[data-rdel]"); if(del){ IV.recDraft.splice(+del.closest("[data-ri]").dataset.ri,1); renderRecipes(); return; }
  if(e.target.closest("[data-rsave]")){
    const rc=IV.recDraft.map(r=>({itemId:r.itemId, qty:r3(num(r.qty)), opt:r.opt||""})).filter(r=>r.itemId && r.qty>0);
    if(await guard(store.patchMenu(m.id,{recipe:rc}))){ IV.recOpen=null; toast(t("inv.rc.saved",{x:m.name})); renderRecipes(); }
  }
});
$("#recList").addEventListener("input",e=>{ const row=e.target.closest("[data-ri]"); if(!row) return; const k=e.target.dataset.rk; if(!k) return; IV.recDraft[+row.dataset.ri][k]=e.target.value; if(k!=="qty") renderRecipes(); });

/* ---------- AI invoice scanner ---------- */
let SAMPLE=undefined, ASSETS=undefined;
async function getSample(){ if(SAMPLE!==undefined) return SAMPLE; try{ SAMPLE = (!DEMO && window.claude && window.claude.use) ? await window.claude.use("sample") : null; }catch(e){ SAMPLE=null; } return SAMPLE; }
async function getAssets(){ if(ASSETS!==undefined) return ASSETS; try{ ASSETS = (!DEMO && window.claude && window.claude.use) ? await window.claude.use("assets") : null; }catch(e){ ASSETS=null; } return ASSETS; }
let SC=null;
const OK_TYPES=["image/jpeg","image/png","image/webp","image/gif"];
async function shrink(file){
  if(OK_TYPES.includes(file.type) && file.size<3.5*1024*1024) return file;
  const bmp=await createImageBitmap(file); const k=Math.min(1, 2400/Math.max(bmp.width,bmp.height));
  const c=document.createElement("canvas"); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
  c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  return await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("encode")),"image/jpeg",0.86));
}
async function uploadPhoto(blob){ const a=await getAssets(); if(!a) return null; try{ const r=await a.upload(blob, OK_TYPES.includes(blob.type)?undefined:{type:"image/jpeg"}); return r.id; }catch(e){ return null; } }
function openScan(){ $("#scan").hidden=false; renderScan(); }
function closeScan(){ if(SC && SC.ctl) try{ SC.ctl.abort(); }catch(e){} if(SC && SC.url && !SC.keepUrl) try{ URL.revokeObjectURL(SC.url); }catch(e){} SC=null; $("#scan").hidden=true; $("#invFile").value=""; }
$("#scanClose").addEventListener("click",()=>{ if(SC && SC.state==="saving") return; closeScan(); });
["#scanBtn","#scanBtn2"].forEach(s=>$(s).addEventListener("click",()=>$("#invFile").click()));
$("#manualBtn").addEventListener("click",()=>{ SC={state:"review", manual:true, data:emptyData()}; SC.data.lines.push(blankLine()); openScan(); });
$("#invFile").addEventListener("change",e=>{ const f=e.target.files && e.target.files[0]; if(f) startScan(f); });
const emptyData = () => ({supplier:"", number:"", date:dayKey(), net:null, vat:null, total:null, lines:[]});
const blankLine = () => ({text:"", qty:1, unit:"", unitPrice:null, lineTotal:null, kind:"product", match:"", stockQty:null, newName:"", newUnit:"pcs", conf:"high"});
function invPrompt(){
  const list=S.inv.filter(x=>x.active!==false).map(x=>({id:x.id, name:x.name, unit:x.unit, knownAs:x.aliases.slice(-6).map(a=>a.raw||a.t)}));
  return `You read supplier invoices (arved / счета) for King's Food, a Turkish kebab kiosk in Tallinn, Estonia. The photo is a purchase invoice or delivery note, usually in Estonian, sometimes English or Russian. Typical suppliers: Sanitex, Hanse Food, Franklin, Sultan Baklava, Selver, Rimi, Metro.

Read every product line and reply with ONLY this JSON (numbers with a dot as decimal separator, no thousands separators):
{"supplier": string, "invoiceNumber": string, "date": "YYYY-MM-DD" or "", "netTotal": number|null, "vatTotal": number|null, "grandTotal": number|null,
 "lines": [{"text": string, "qty": number, "unit": string, "unitPrice": number|null, "lineTotal": number|null, "kind": "product"|"deposit"|"discount"|"fee",
   "itemId": string|null, "stockQty": number|null, "suggestName": string, "suggestUnit": "kg"|"g"|"l"|"ml"|"pcs"|"pack"|"box", "confidence": "high"|"medium"|"low"}]}

Rules:
- One entry per printed product line, in printed order. "text" = the product name exactly as printed. Skip header, address and payment lines.
- lineTotal = the line amount WITHOUT VAT (käibemaksuta / km-ta) when the invoice shows both; unitPrice likewise.
- kind "deposit" for bottle/packaging deposits (pant, pandipakend, tagatisraha), "discount" for discounts, "fee" for delivery or service fees.
- Match each product line to ONE of our stock items below by "itemId" only when it is clearly the same product (consider knownAs names); otherwise null. Never invent ids.
- stockQty = the quantity expressed in the matched item's unit (e.g. 2 boxes x 10 kg for an item in kg -> 20; 6 x 1,5 l bottles for an item in pcs -> 6). null when unmatched or unsure.
- suggestName = a short clean product name for a new stock item (e.g. "Kanakintsuliha", "Tortilla 30 cm"); suggestUnit = the natural stock unit for it.
- confidence = how sure you are about the reading AND the match of that line.
- Do not invent lines you cannot read. If the photo is not an invoice or receipt, reply {"error":"not_invoice"}.

Our stock items (JSON): ${JSON.stringify(list)}`;
}
function normalize(res){
  const n=v=>{ const x=typeof v==="number"?v:num(v); return x===null||!isFinite(x)?null:r3(x); };
  const d=emptyData();
  d.supplier=String(res.supplier||"").slice(0,80); d.number=String(res.invoiceNumber||"").slice(0,40);
  d.date=/^\d{4}-\d{2}-\d{2}$/.test(String(res.date||""))?String(res.date):dayKey();
  d.net=n(res.netTotal); d.vat=n(res.vatTotal); d.total=n(res.grandTotal);
  d.lines=(Array.isArray(res.lines)?res.lines:[]).slice(0,80).map(l=>{
    const kind=["product","deposit","discount","fee"].includes(l.kind)?l.kind:"product";
    const it=l.itemId && S.inv.find(x=>x.id===String(l.itemId) && x.active!==false);
    const conf=["high","medium","low"].includes(l.confidence)?l.confidence:"medium";
    const q=n(l.qty)??1;
    return {text:String(l.text||"").slice(0,120), qty:q, unit:String(l.unit||"").slice(0,12), unitPrice:n(l.unitPrice), lineTotal:n(l.lineTotal), kind, conf,
      match: kind!=="product" ? "" : it ? it.id : "new", stockQty: it ? (n(l.stockQty) ?? q) : q,
      newName:String(l.suggestName||l.text||"").slice(0,60), newUnit:UNITS.includes(l.suggestUnit)?l.suggestUnit:unitFrom(l.unit), aiMatched:!!it};
  });
  return d;
}
function applyLearned(d){
  const sup=normTxt(d.supplier);
  for(const l of d.lines){ if(l.kind!=="product") continue; const tx=normTxt(l.text); if(!tx) continue;
    for(const it of S.inv){ if(it.active===false) continue; const a=it.aliases.find(a=>a.t===tx && (!a.s || !sup || a.s===sup));
      if(a){ l.match=it.id; l.stockQty=r3(l.qty*(Number(a.f)||1)); l.learned=true; break; } } }
}
function dupOf(d){ const s=normTxt(d.supplier), n=normTxt(d.number), me=SC&&SC.edit?SC.edit.id:null; if(!n) return null; return S.invoices.find(v=>v.id!==me && normTxt(v.number)===n && (!s || normTxt(v.supplier)===s)) || null; }
function totalCheck(d){
  const sum=r2(d.lines.reduce((s,l)=>s+(Number(l.lineTotal)||0),0)), ref = d.net ?? (d.total!=null && d.vat!=null ? r2(d.total-d.vat) : null);
  if(ref===null || !d.lines.some(l=>l.lineTotal!=null)) return {sum, ref, ok:null};
  return {sum, ref, ok: Math.abs(sum-ref) <= Math.max(0.05, Math.abs(ref)*0.01)};
}
function readyToApply(d){
  if(dupOf(d)) return false; const tc=totalCheck(d); if(tc.ok!==true) return false;
  const prods=d.lines.filter(l=>l.kind==="product"); if(!prods.length) return false;
  return prods.every(l=>l.match && l.match!=="new" && Number(l.stockQty)>0 && (l.learned || l.conf==="high"));
}
async function startScan(file){
  SC={state:"reading", url:URL.createObjectURL(file)}; openScan();
  const my=SC; let blob=file; try{ blob=await shrink(file); }catch(e){}
  if(SC!==my) return; SC.blob=blob; SC.photoP=uploadPhoto(blob);
  await runAI();
}
async function runAI(){
  const my=SC; if(!my) return;
  const sample=await getSample(); if(SC!==my) return;
  let lim=null; try{ lim = sample ? await sample.limits() : null; }catch(e){}
  if(!sample || !lim || !lim.images){ my.state="review"; my.manual=true; my.note=t("scan.noAI"); my.data=emptyData(); my.data.lines.push(blankLine()); renderScan(); return; }
  my.state="reading"; my.err=""; renderScan();
  my.ctl=new AbortController();
  try{
    const res=await sample.json(invPrompt(), {images:[my.blob], signal:my.ctl.signal, modelTier:"default"});
    if(SC!==my) return;
    if(!res || typeof res!=="object" || res.error){ my.state="error"; my.err=t(res && res.error==="not_invoice"?"scan.e.notInvoice":"scan.e.read"); renderScan(); return; }
    my.data=normalize(res); applyLearned(my.data);
    if(!my.data.lines.length){ my.state="error"; my.err=t("scan.e.noLines"); renderScan(); return; }
    my.state="review";
    if(S.settings.autoApply && readyToApply(my.data)){ await applyInvoice(true); return; }
    renderScan();
  }catch(e){
    if(SC!==my) return; const c=e&&e.code;
    if(c==="cancelled") return;
    my.state="error"; my.retry = !["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed","images_unavailable"].includes(c);
    my.err = c==="not_granted"||c==="sampling_disabled" ? t("scan.e.off") : c==="image_rejected" ? t("scan.e.image") : c==="rate_limited" ? t("scan.e.limit") : c==="session_expired" ? t("scan.e.session") : t("scan.e.read");
    renderScan();
  }
}
function lineRow(l,i){
  const act=S.inv.filter(x=>x.active!==false || x.id===l.match).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const it=S.inv.find(x=>x.id===l.match), unitCost = l.lineTotal!=null && Number(l.stockQty)>0 ? r2(l.lineTotal/l.stockQty) : null;
  const tag = l.learned ? `<span class="tag ok">${esc(t("scan.learned"))}</span>` : l.kind!=="product" ? `<span class="tag">${esc(t("scan.k."+l.kind))}</span>` : l.conf==="low" ? `<span class="tag warn">${esc(t("scan.check"))}</span>` : "";
  return `<div class="sline ${l.match===""?"ign":""}" data-li="${i}">
    <div class="sl-a"><input data-lk="text" value="${esc(l.text)}" placeholder="${esc(t("inv.r.line"))}" aria-label="${esc(t("inv.r.line"))}">
      <div class="sl-nums"><label><span>${esc(t("d.qty"))}</span><input data-lk="qty" inputmode="decimal" value="${l.qty!=null?esc(fqIn(l.qty)):""}"></label><span class="muted">${esc(l.unit||"")}</span>
      <label><span>${esc(t("inv.r.amount"))}</span><input data-lk="lineTotal" inputmode="decimal" value="${l.lineTotal!=null?esc(fmIn(l.lineTotal)):""}" placeholder="€"></label>${tag}</div></div>
    <div class="sl-b"><select data-lk="match" aria-label="${esc(t("inv.r.stock"))}">
        <option value="" ${l.match===""?"selected":""}>${esc(t("scan.ignore"))}</option><option value="new" ${l.match==="new"?"selected":""}>${esc(t("scan.new"))}</option>
        ${act.map(x=>`<option value="${esc(x.id)}" ${x.id===l.match?"selected":""}>${esc(x.name)} (${esc(uL(x.unit))})</option>`).join("")}</select>
      ${l.match==="new"?`<div class="sl-new"><input data-lk="newName" value="${esc(l.newName)}" maxlength="60" placeholder="${esc(t("inv.f.name"))}" aria-label="${esc(t("inv.f.name"))}"><select data-lk="newUnit" aria-label="${esc(t("inv.f.unit"))}">${UNITS.map(u=>`<option value="${u}" ${u===l.newUnit?"selected":""}>${esc(uL(u))}</option>`).join("")}</select></div>`:""}
      ${l.match!==""?`<label class="sl-in"><span>${esc(t("scan.into"))}</span><input data-lk="stockQty" inputmode="decimal" value="${l.stockQty!=null?esc(fqIn(l.stockQty)):""}"><b>${esc(uL(it?it.unit:l.newUnit))}</b>${unitCost!==null?`<small class="muted">${esc(t("scan.per",{x:eur(unitCost), u:uL(it?it.unit:l.newUnit)}))}</small>`:""}</label>`:""}
    </div>
    <button class="sl-x" data-ldel aria-label="${esc(t("m.remove"))}">✕</button></div>`;
}
const fqIn = n => String(r3(n)).replace(".", LANG==="en"?".":",");
const fmIn = n => r2(n).toFixed(2).replace(".", LANG==="en"?".":",");
function renderScan(){
  if(!SC){ $("#scan").hidden=true; return; }
  const b=$("#scanBody"); $("#scanTitle").textContent = t(SC.edit ? "scan.titleEdit" : SC.manual && !SC.url ? "scan.titleManual" : "scan.title");
  $("#scanClose").textContent = t(SC.state==="done"?"demo.close":"cancel"); $("#scanClose").disabled = SC.state==="saving";
  const photo = SC.url ? `<div class="sphoto"><img src="${SC.url}" alt="${esc(t("inv.v.photo"))}"></div>` : "";
  if(SC.state==="reading"){ b.innerHTML=`<div class="sgrid">${photo}<div class="sreading"><span class="spin" aria-hidden="true"></span><b>${esc(t("scan.reading"))}</b><p class="muted">${esc(t("scan.readingD"))}</p><button class="act lite" data-sstop>${esc(t("scan.stop"))}</button></div></div>`; return; }
  if(SC.state==="error"){ b.innerHTML=`<div class="sgrid">${photo}<div class="sreading"><b class="errt">${esc(SC.err)}</b><div class="fbtns">${SC.retry&&SC.blob?`<button class="act acc" data-sretry>${esc(t("scan.retry"))}</button>`:""}<button class="act lite" data-smanual>${esc(t("scan.manual"))}</button></div></div></div>`; return; }
  if(SC.state==="saving"){ b.innerHTML=`<div class="sreading"><span class="spin" aria-hidden="true"></span><b>${esc(t("scan.saving"))}</b></div>`; return; }
  if(SC.state==="done"){ const r=SC.result;
    b.innerHTML=`<div class="sdone"><span class="logo" aria-hidden="true"></span><h4>${esc(t(r.edit?"scan.doneEdit":r.auto?"scan.doneAuto":"scan.done"))}</h4><p>${esc(tn("scan.doneD",r.n,{x:r.supplier||t("inv.v.unknown"), e:eur(r.total)}))}</p>
      <ul>${r.lines.map(l=>`<li><b>+${esc(fq(l.q))} ${esc(l.u)}</b> ${esc(l.name)}</li>`).join("")}</ul>
      <div class="fbtns"><button class="act acc" data-sclose>${esc(t("demo.close"))}</button><button class="act lite" data-sundo>${esc(t("undo"))}</button></div></div>`; return; }
  const d=SC.data, dup=dupOf(d), tc=totalCheck(d);
  const prods=d.lines.filter(l=>l.match!==""), canApply = prods.length && prods.every(l=>Number(l.stockQty)>0 && (l.match!=="new" || l.newName.trim()));
  b.innerHTML=`<div class="sgrid rev">${photo}<div class="sform">
    ${SC.note?`<p class="snote">${esc(SC.note)}</p>`:""}
    <div class="sfields">
      <label class="w2">${esc(t("scan.f.supplier"))}<input data-hk="supplier" value="${esc(d.supplier)}" maxlength="80"></label>
      <label>${esc(t("scan.f.number"))}<input data-hk="number" value="${esc(d.number)}" maxlength="40"></label>
      <label>${esc(t("scan.f.date"))}<input type="date" data-hk="date" value="${esc(d.date)}"></label>
      <label>${esc(t("scan.f.net"))}<input data-hk="net" inputmode="decimal" value="${d.net!=null?esc(fmIn(d.net)):""}"></label>
      <label>${esc(t("scan.f.total"))}<input data-hk="total" inputmode="decimal" value="${d.total!=null?esc(fmIn(d.total)):""}"></label>
    </div>
    ${dup?`<p class="swarn">${esc(t("scan.dup",{d:dmy(dup.createdAt)}))}</p>`:""}
    <p class="scheck ${tc.ok===true?"ok":tc.ok===false?"bad":""}" id="sCheck">${esc(tc.ok===null?t("scan.tc.na",{s:eur(tc.sum)}):tc.ok?t("scan.tc.ok",{s:eur(tc.sum)}):t("scan.tc.bad",{s:eur(tc.sum), r:eur(tc.ref)}))}</p>
    <div class="slines">${d.lines.map(lineRow).join("")}</div>
    <button class="act lite" data-ladd>${esc(t("scan.addLine"))}</button>
    <div class="sactions"><button class="place" data-sapply ${canApply?"":"disabled"}>${esc(t(SC.edit?"scan.saveEdit":"scan.apply",{n:prods.length}))}</button></div>
    <p class="hintline">${esc(t(SC.edit?"scan.editHint":"scan.learnHint"))}</p>
  </div></div>`;
}
$("#scanBody").addEventListener("click",async e=>{
  if(!SC) return;
  if(e.target.closest("[data-sstop]")){ closeScan(); return; }
  if(e.target.closest("[data-sretry]")){ runAI(); return; }
  if(e.target.closest("[data-smanual]")){ SC.state="review"; SC.manual=true; SC.data=SC.data||emptyData(); if(!SC.data.lines.length) SC.data.lines.push(blankLine()); renderScan(); return; }
  if(e.target.closest("[data-sclose]")){ closeScan(); return; }
  if(e.target.closest("[data-sundo]") && SC.edit){ const snap=SC.prev; closeScan(); await restoreInvoice(snap); return; }
  if(e.target.closest("[data-sundo]")){ const r=SC.result; for(const id of r.moveIds) await guard(store.delDoc("invmoves", id)); await guard(store.delDoc("invoices", r.invId)); toast(t("inv.v.deleted")); closeScan(); return; }
  if(e.target.closest("[data-ladd]")){ SC.data.lines.push(blankLine()); renderScan(); return; }
  const x=e.target.closest("[data-ldel]"); if(x){ SC.data.lines.splice(+x.closest("[data-li]").dataset.li,1); renderScan(); return; }
  if(e.target.closest("[data-sapply]")) applyInvoice(false);
});
$("#scanBody").addEventListener("input",e=>{
  if(!SC || !SC.data) return; const el=e.target;
  if(el.dataset.hk){ const k=el.dataset.hk; SC.data[k] = (k==="net"||k==="total") ? num(el.value) : el.value; if(k==="net"||k==="total") updCheck(); return; }
  const row=el.closest("[data-li]"); if(!row || !el.dataset.lk) return; const l=SC.data.lines[+row.dataset.li], k=el.dataset.lk;
  if(k==="qty"||k==="lineTotal"||k==="stockQty") l[k]=num(el.value); else l[k]=el.value;
  if(k==="match"){ const it=S.inv.find(x=>x.id===l.match); if(l.match!=="" && l.kind!=="product") l.kind="product"; if(it){ l.learned=false; const a=it.aliases.find(a=>a.t===normTxt(l.text)); l.stockQty = a ? r3((l.qty||1)*(Number(a.f)||1)) : (l.stockQty ?? l.qty); } }
  if(k==="match"||k==="newUnit") { renderScan(); return; }
  if(k==="lineTotal") updCheck();
  updApply();
});
function updCheck(){ const tc=totalCheck(SC.data), el=$("#sCheck"); if(!el) return; el.className="scheck "+(tc.ok===true?"ok":tc.ok===false?"bad":""); el.textContent = tc.ok===null?t("scan.tc.na",{s:eur(tc.sum)}):tc.ok?t("scan.tc.ok",{s:eur(tc.sum)}):t("scan.tc.bad",{s:eur(tc.sum), r:eur(tc.ref)}); }
function updApply(){ const b=document.querySelector("[data-sapply]"); if(!b) return; const prods=SC.data.lines.filter(l=>l.match!==""); b.disabled = !(prods.length && prods.every(l=>Number(l.stockQty)>0 && (l.match!=="new" || String(l.newName).trim()))); b.textContent=t(SC.edit?"scan.saveEdit":"scan.apply",{n:prods.length}); }
const stripId = o => { const {id, ...r}=o; return r; };
function invSnapshot(v){ return {inv:stripId(v), id:v.id, moves:S.moves.filter(m=>m.invoiceId===v.id).map(m=>({...m}))}; }
async function restoreInvoice(snap){
  const cur=S.moves.filter(m=>m.invoiceId===snap.id && !snap.moves.some(o=>o.id===m.id));
  for(const m of cur) await guard(store.delDoc("invmoves", m.id));
  for(const m of snap.moves) await guard(store.setDoc("invmoves", m.id, stripId(m)));
  if(await guard(store.setDoc("invoices", snap.id, snap.inv))) toast(t("inv.v.restored"));
}
function editInvoice(v){
  const d={supplier:v.supplier||"", number:v.number||"", date:v.date||dayKey(), net:v.net??null, vat:v.vat??null, total:v.total??null,
    lines:(v.lines||[]).map(l=>{ const it=l.itemId && S.inv.find(x=>x.id===l.itemId);
      return {text:String(l.text||""), qty:l.qty??1, unit:l.unit||"", unitPrice:null, lineTotal:l.lineTotal??null, kind:l.kind||"product", conf:"high",
        match: it ? it.id : "", stockQty: it ? (l.stockQty??l.qty??1) : (l.qty??1), newName:String(l.text||"").slice(0,60), newUnit:"pcs", learned:false}; })};
  if(!d.lines.length) d.lines.push(blankLine());
  SC={state:"review", manual:true, edit:v, invId:v.id, prev:invSnapshot(v), data:d, url: v.photo ? assetUrl(v.photo) : null, keepUrl:true};
  openScan();
}
async function applyInvoice(auto){
  const my=SC; if(!my || my.state==="saving") return; const d=my.data;
  if(!auto && dupOf(d) && !my.dupOk){ my.dupOk=true; toast(t("scan.dupConfirm")); return; }
  my.state="saving"; renderScan();
  const photo = my.edit ? (my.edit.photo||"") : my.photoP ? await my.photoP : null;
  const now=Date.now(), at = my.edit ? (Number(my.edit.createdAt)||now) : now, by=S.user?S.user.id:"", byName=S.user?S.user.name:"", sup=d.supplier.trim(), supN=normTxt(sup);
  my.invId = my.invId || newId("iv");
  const used=[], moveIds=[]; let ok=true;
  for(let i=0;i<d.lines.length && ok;i++){
    const l=d.lines[i]; if(l.match==="" || !(Number(l.stockQty)>0)) continue;
    const q=r3(l.stockQty), unitCost = l.lineTotal!=null && l.lineTotal>0 ? r3(l.lineTotal/q) : null;
    const alias={t:normTxt(l.text), raw:l.text.slice(0,60), s:supN, f:r3(q/(Number(l.qty)||1))};
    let it=S.inv.find(x=>x.id===l.match);
    if(l.match==="new"){
      l.newId = l.newId || newId("it");
      const rec={name:l.newName.trim()||l.text, unit:l.newUnit, cat:"", min:0, cost:unitCost||0, supplier:sup, aliases:alias.t?[alias]:[], active:true, createdAt:now-1000};
      ok = await guard(store.setDoc("inv", l.newId, rec)); it={id:l.newId, ...rec};
    } else if(it){
      const al=it.aliases.filter(a=>!(a.t===alias.t && a.s===alias.s)); if(alias.t) al.push(alias);
      const patch={aliases:al.slice(-30)}; if(unitCost!==null) patch.cost=unitCost; if(sup && !it.supplier) patch.supplier=sup;
      ok = await guard(store.patchDoc("inv", it.id, patch));
    }
    if(!ok || !it) break;
    const mid=my.invId+"_"+i;
    ok = await guard(store.setDoc("invmoves", mid, {itemId:it.id, type:"delivery", qty:q, unitCost, at, by, byName, invoiceId:my.invId, note:sup}));
    if(ok){ moveIds.push(mid); used.push({q, u:uL(it.unit), name:it.name}); l.itemId=it.id; }
  }
  if(ok && my.edit){ for(const m of S.moves.filter(m=>m.invoiceId===my.invId && !moveIds.includes(m.id))) await guard(store.delDoc("invmoves", m.id)); }
  const meta = my.edit ? {auto:!!my.edit.auto, createdAt:my.edit.createdAt||now, by:my.edit.by||"", byName:my.edit.byName||"", editedAt:now, editedBy:by, editedByName:byName} : {auto:!!auto, createdAt:now, by, byName};
  if(ok) ok = await guard(store.setDoc("invoices", my.invId, {supplier:sup, number:d.number.trim(), date:d.date, net:d.net, vat:d.vat, total:d.total ?? d.net ?? r2(d.lines.reduce((s,l)=>s+(Number(l.lineTotal)||0),0)),
    photo:photo||"", ...meta,
    lines:d.lines.map(l=>({text:l.text, qty:l.qty, unit:l.unit, lineTotal:l.lineTotal, kind:l.kind, itemId:l.match===""?null:(l.itemId||null), stockQty:l.match===""?null:r3(l.stockQty)}))}));
  if(SC!==my) return;
  if(!ok){ my.state="review"; renderScan(); return; }
  my.state="done"; my.result={auto, edit:!!my.edit, n:used.length, supplier:sup, total:d.total ?? d.net ?? 0, lines:used, moveIds, invId:my.invId};
  renderScan(); IV.tab="invoices"; renderInv();
}
