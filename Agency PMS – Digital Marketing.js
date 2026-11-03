const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr=n=>"₹"+Math.round(n||0).toLocaleString("en-IN"),uid=()=>Math.random().toString(36).slice(2,9);
const fd=d=>d?new Date(d+"T00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"-";
const iso=o=>{const d=new Date();d.setDate(d.getDate()+o);return d.toISOString().slice(0,10)};
async function hash(s){try{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("pms:"+s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}catch(e){return"x"+btoa(s)}}
let DB,U=null,pg="dash",mem=null;
const save=()=>{mem=JSON.stringify(DB);try{localStorage.setItem("pms_db",mem)}catch(e){}};
const PG=[["services","Services"],["projects","Projects"],["tasks","Tasks"],["costing","Project Costing"],["payments","Payments"],["reports","Reports"]];
const full=(c,k)=>({none:0,view:1,edit:2}[c.perms[k]||"none"]);
async function seed(){
  const A=await hash("acme123"),J=await hash("jewel123");
  const P={projects:"edit",tasks:"edit",services:"view",costing:"view",payments:"view",reports:"view"};
  DB={admin:{uid:"admin",pw:await hash("admin123")},
  services:[["SEO","Monthly SEO retainer",15000],["Social Media Management","Posts, reels, community",20000],["Google Ads Management","Search + display campaigns",12000],["Website Development","Business website",50000],["Content Writing","Blogs & copy",8000],["Branding","Logo & brand kit",25000]].map(([name,desc,price])=>({id:uid(),name,desc,price})),
  clients:[{id:"c1",name:"Rakesh Shah",company:"Acme Industries",email:"rakesh@acme.example",phone:"98250 00001",uid:"acme",pw:A,perms:{...P}},
           {id:"c2",name:"Meera Patel",company:"Surat Jewels",email:"meera@jewels.example",phone:"98250 00002",uid:"jewels",pw:J,perms:{projects:"view",tasks:"view",services:"view",costing:"none",payments:"none",reports:"none"}}],
  projects:[],tasks:[],costs:[],payments:[],dash:{}};
  const sv=DB.services,p=(cid,name,sids,status,pr,s,d)=>{const id=uid();DB.projects.push({id,cid,name,sids:sids.map(i=>sv[i].id),status,pr,start:s,due:d,note:""});return id};
  const a=p("c1","Industrial Lead-Gen Campaign",[2,0],"Active",60,iso(-40),iso(20)),b=p("c1","Corporate Website",[3],"Completed",100,iso(-90),iso(-30)),c=p("c2","Festive Social Campaign",[1,5],"Active",35,iso(-20),iso(30)),d=p("c2","Brand Refresh",[5],"Planning",5,iso(-3),iso(60));
  [[a,"Setup Google Ads account","Admin",iso(-30),"Done"],[a,"Landing page A/B test","Admin",iso(5),"In Progress"],[a,"Share product catalogue","Client",iso(2),"Pending"],[b,"Final handover","Admin",iso(-30),"Done"],[c,"Reel shoot schedule","Admin",iso(7),"In Progress"],[c,"Approve festive creatives","Client",iso(4),"Pending"],[d,"Moodboard","Admin",iso(10),"Pending"]].forEach(([pid,title,who,due,st])=>DB.tasks.push({id:uid(),pid,title,who,due,status:st}));
  [[a,"Ads management (3 mo)",36000],[a,"SEO retainer (3 mo)",45000],[b,"Website build",50000],[c,"Social media (2 mo)",40000],[c,"Brand kit",25000],[d,"Branding",25000]].forEach(([pid,item,amt])=>DB.costs.push({id:uid(),pid,item,amt}));
  [[a,40000,iso(-35),"UPI"],[a,20000,iso(0),"Bank"],[b,50000,iso(-60),"Bank"],[c,30000,iso(-10),"UPI"]].forEach(([pid,amt,date,mode])=>DB.payments.push({id:uid(),pid,amt,date,mode}));
  save()}
async function init(){try{DB=JSON.parse(localStorage.getItem("pms_db"))}catch(e){}if(!DB)await seed();login()}
function login(msg){U=null;$("#root").innerHTML=`<div id="login"><div class="box"><h2 style="font-size:19px">Agency PMS</h2><div class="mu">Digital Marketing – Project Management</div>
<label>Login as</label><select id="lr"><option value="admin">Admin / User (Service Provider)</option><option value="client">Client</option></select>
<label>User ID</label><input id="lu" autocomplete="username"><label>Password</label><input id="lp" type="password" autocomplete="current-password" onkeydown="if(event.key=='Enter')doLogin()">
<div class="err" id="le">${msg||""}</div><button class="p" style="width:100%;margin-top:12px" onclick="doLogin()">Login</button>
<p class="mu">Demo → Admin: admin / admin123 · Client: acme / acme123 (full access) or jewels / jewel123 (limited)</p></div></div>`}
async function doLogin(){const r=$("#lr").value,u=$("#lu").value.trim(),h=await hash($("#lp").value);
  if(r=="admin"&&u==DB.admin.uid&&h==DB.admin.pw)U={role:"admin"};
  else if(r=="client"){const c=DB.clients.find(c=>c.uid==u&&c.pw==h);if(c)U={role:"client",cid:c.id}}
  if(!U)return $("#le").textContent="Invalid ID or password";pg="dash";shell()}
const adm=()=>U.role=="admin",me=()=>DB.clients.find(c=>c.id==U.cid);
const prj=()=>adm()?DB.projects:DB.projects.filter(p=>p.cid==U.cid);
const pids=()=>prj().map(p=>p.id),inP=x=>pids().includes(x.pid);
const cost=p=>DB.costs.filter(x=>x.pid==p).reduce((a,x)=>a+ +x.amt,0),paid=p=>DB.payments.filter(x=>x.pid==p).reduce((a,x)=>a+ +x.amt,0);
const cn=id=>(DB.clients.find(c=>c.id==id)||{}).company||"-",pn=id=>(DB.projects.find(p=>p.id==id)||{}).name||"-";
const sn=ids=>(ids||[]).map(i=>(DB.services.find(s=>s.id==i)||{}).name).filter(Boolean).join(", ")||"-";
function menu(){const m=[["dash","Dashboard"]];if(adm()){m.push(["clients","Clients"]);PG.forEach(x=>m.push(x));m.push(["db","Project Database"],["pw","Settings"])}
  else{const c=me();PG.forEach(([k,l])=>{if(full(c,k=="costing"||k=="payments"||k=="reports"||k=="services"||k=="tasks"||k=="projects"?k:k))m.push([k,k=="projects"?"My Projects":l])})}return m}
const IC={dash:"🏠",clients:"👥",services:"🧩",projects:"📁",tasks:"✅",costing:"🧮",payments:"💳",reports:"📊",db:"🗄️",pw:"⚙️"};
function bottom(){const m=menu(),ks=m.map(x=>x[0]),bt=m.length<=5?ks:["dash","clients","projects","tasks","payments","costing"].filter(k=>ks.includes(k)).slice(0,4);return{m,bt}}
function shell(){const{m,bt}=bottom(),lbl=k=>m.find(x=>x[0]==k)[1];
$("#root").innerHTML=`<div class="app"><aside><h3>📈 Agency PMS</h3>${m.map(([k,l])=>`<a class="${pg==k?"on":""}" onclick="go('${k}')">${IC[k]} ${l}</a>`).join("")}<a onclick="login()" style="margin-top:14px">⎋ Logout</a></aside>
<div class="main"><div class="top"><h1>${lbl(pg)}</h1><span class="chip b">${adm()?"Admin":esc(me().company)}</span><button class="lo" onclick="login()">⎋</button></div><div id="pg"></div></div>
<nav id="bn">${bt.map(k=>`<a class="${pg==k?"on":""}" onclick="go('${k}')"><i>${IC[k]}</i>${lbl(k).replace("Project Costing","Costing").replace("My Projects","Projects")}</a>`).join("")}${m.length>bt.length?`<a class="${bt.includes(pg)?"":"on"}" onclick="more()"><i>☰</i>More</a>`:""}</nav></div>`;view()}
function more(){const{m,bt}=bottom();$("#mb").innerHTML=`<h2>Menu</h2>${m.filter(x=>!bt.includes(x[0])).map(([k,l])=>`<a class="mi" onclick="closeM();go('${k}')">${IC[k]} ${l}</a>`).join("")}<a class="mi" onclick="closeM();login()">⎋ Logout</a>`;$("#md").style.display="flex"}
const go=k=>{pg=k;shell()};
function view(){const f={dash,clients,services,projects,tasks,costing,payments,reports,db:dbp,pw}[pg];$("#pg").innerHTML=f()}
const rr=()=>{save();view()};
function tbl(h,rows){return`<div class="tw"><table><tr>${h.map(x=>`<th>${x}</th>`).join("")}</tr>${rows.length?rows.map(r=>`<tr>${r.map((c,i)=>`<td data-l="${esc(h[i]||"")}">${c}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${h.length}" class="mu">No records.</td></tr>`}</table></div>`}
const bar=v=>`<div class="bar"><i style="width:${v}%"></i></div><span class="mu">${v}%</span>`;
const st=s=>`<span class="chip ${{Active:"b",Completed:"g",Planning:"o",Done:"g","In Progress":"b",Pending:"o","On Hold":"r"}[s]||""}">${esc(s)}</span>`;
const acts=(k,id)=>`<button class="s" onclick="openForm('${k}','${id}')">Edit</button> <button class="s d" onclick="del('${k}','${id}')">Del</button>`;
const head=(t,k)=>`<div class="row" style="margin-bottom:10px"><h2 class="sp" style="margin:0">${t}</h2>${k?`<button class="p add" onclick="openForm('${k}')">＋ Add</button>`:""}</div>`;
/* ---------- Dashboard (customizable) ---------- */
function widgets(){const P=prj(),ids=pids(),c=adm()?null:me(),pay=DB.payments.filter(x=>ids.includes(x.pid)),T=DB.tasks.filter(t=>ids.includes(t.pid));
  const tc=P.reduce((a,p)=>a+cost(p.id),0),pd=pay.reduce((a,x)=>a+ +x.amt,0),mo=new Date().toISOString().slice(0,7);
  const w=[["clients","Total Clients",DB.clients.length,adm()],["active","Active Projects",P.filter(p=>p.status=="Active").length,adm()||full(c,"projects")],["done","Completed Projects",P.filter(p=>p.status=="Completed").length,adm()||full(c,"projects")],
  ["tasks","Pending Tasks",T.filter(t=>t.status!="Done").length,adm()||full(c,"tasks")],["cost","Project Cost",inr(tc),adm()||full(c,"costing")],["paid","Client Payments",inr(pd),adm()||full(c,"payments")],
  ["out","Outstanding Amount",inr(tc-pd),adm()||full(c,"payments")],["rev","Monthly Revenue",inr(pay.filter(x=>x.date.startsWith(mo)).reduce((a,x)=>a+ +x.amt,0)),adm()||full(c,"payments")]];
  return w.filter(x=>x[3])}
function dash(){const k=adm()?"admin":U.cid,hid=DB.dash[k]||[],w=widgets(),T=DB.tasks.filter(inP).filter(t=>t.status!="Done").sort((a,b)=>a.due>b.due?1:-1).slice(0,5);
  const pay=DB.payments.filter(inP).sort((a,b)=>a.date<b.date?1:-1).slice(0,5),c=adm()?null:me();
  return`<div class="row" style="margin-bottom:10px"><div class="sp mu">${adm()?"Overview of all clients":"Welcome, "+esc(me().name)}</div><button onclick="cust()">⚙ Customize dashboard</button></div>
  <div class="grid">${w.filter(x=>!hid.includes(x[0])).map(x=>`<div class="card kpi" style="margin:0"><b>${x[2]}</b><span>${x[1]}</span></div>`).join("")}</div>
  <div class="grid g1" style="margin-top:14px"><div class="card"><h2>Active projects</h2>${(adm()||full(c,"projects"))?tbl(["Project","Progress"],prj().filter(p=>p.status=="Active").map(p=>[esc(p.name),bar(p.pr)])):'<span class="mu">Not shared.</span>'}</div>
  <div class="card"><h2>Upcoming tasks</h2>${(adm()||full(c,"tasks"))?tbl(["Task","Due"],T.map(t=>[esc(t.title),fd(t.due)])):'<span class="mu">Not shared.</span>'}</div>
  <div class="card"><h2>Recent payments</h2>${(adm()||full(c,"payments"))?tbl(["Project","Amount","Date"],pay.map(x=>[esc(pn(x.pid)),inr(x.amt),fd(x.date)])):'<span class="mu">Not shared.</span>'}</div></div>`}
function cust(){const k=adm()?"admin":U.cid,hid=DB.dash[k]||[];$("#mb").innerHTML=`<h2>Customize dashboard</h2><div class="mu">Jo cards dikhane hain unhe tick karo.</div>${widgets().map(x=>`<label style="color:var(--tx)"><input type="checkbox" style="width:auto" value="${x[0]}" ${hid.includes(x[0])?"":"checked"}> ${x[1]}</label>`).join("")}
  <div class="row" style="margin-top:14px"><button class="p" onclick="DB.dash['${k}']=[...document.querySelectorAll('#mb input')].filter(i=>!i.checked).map(i=>i.value);closeM();rr()">Save</button><button onclick="closeM()">Cancel</button></div>`;$("#md").style.display="flex"}
/* ---------- Generic CRUD ---------- */
const E={
 services:{col:"services",title:"Service",f:[["name","Service name"],["desc","Description"],["price","Standard price (₹)","number"]]},
 projects:{col:"projects",title:"Project",f:[["name","Project name"],["cid","Client","select",()=>DB.clients.map(c=>[c.id,c.company])],["sids","Assigned services","multi",()=>DB.services.map(s=>[s.id,s.name])],["status","Status","select",()=>["Planning","Active","On Hold","Completed"].map(x=>[x,x])],["pr","Progress %","number"],["start","Start","date"],["due","Due","date"],["note","Client feedback / notes","textarea"]]},
 tasks:{col:"tasks",title:"Task",f:[["title","Task"],["pid","Project","select",()=>prj().map(p=>[p.id,p.name])],["who","Owner","select",()=>[["Admin","Agency"],["Client","Client"]]],["due","Due","date"],["status","Status","select",()=>["Pending","In Progress","Done"].map(x=>[x,x])]]},
 costs:{col:"costs",title:"Cost line",f:[["pid","Project","select",()=>DB.projects.map(p=>[p.id,p.name])],["item","Cost item"],["amt","Amount (₹)","number"]]},
 payments:{col:"payments",title:"Payment",f:[["pid","Project","select",()=>DB.projects.map(p=>[p.id,p.name])],["amt","Amount (₹)","number"],["date","Date","date"],["mode","Mode","select",()=>["UPI","Bank","Cash","Cheque"].map(x=>[x,x])]]}};
function fld(f,v){const[k,l,t="text",o]=f,val=v[k]??"";if(t=="select")return`<label>${l}</label><select id="f_${k}">${o().map(([a,b])=>`<option value="${esc(a)}" ${a==val?"selected":""}>${esc(b)}</option>`).join("")}</select>`;
  if(t=="multi")return`<label>${l}</label>${o().map(([a,b])=>`<label style="color:var(--tx);margin:2px"><input type="checkbox" style="width:auto" name="f_${k}" value="${a}" ${(val||[]).includes(a)?"checked":""}> ${esc(b)}</label>`).join("")}`;
  if(t=="textarea")return`<label>${l}</label><textarea id="f_${k}">${esc(val)}</textarea>`;return`<label>${l}</label><input id="f_${k}" type="${t}" value="${esc(val)}">`}
function openForm(k,id){const e=E[k]||{col:"clients",title:"Client",f:[["name","Contact name"],["company","Company"],["email","Email","email"],["phone","Phone"]]},v=DB[e.col].find(x=>x.id==id)||(k=="projects"?{status:"Planning",pr:0,sids:[]}:{});
  let x=e.f.map(f=>fld(f,v)).join("");
  if(k=="clients"){const p=v.perms||{};x+=`<label>Login User ID</label><input id="f_uid" value="${esc(v.uid||"")}"><label>Password ${id?"(blank = unchanged)":""}</label><input id="f_pw" type="text" placeholder="set password">
  <h2 style="margin-top:14px">Client permissions</h2><div class="mu">Hidden = menu me nahi dikhega · View = sirf dekh sakta · Edit = tasks (status/add) & project feedback me change</div>
  ${PG.map(([a,l])=>`<div class="row" style="margin-top:6px"><span class="sp">${l}</span><select id="p_${a}" style="width:130px"><option value="none">Hidden</option><option value="view" ${p[a]=="view"?"selected":""}>View</option>${["tasks","projects"].includes(a)?`<option value="edit" ${p[a]=="edit"?"selected":""}>View + Edit</option>`:""}</select></div>`).join("")}`}
  $("#mb").innerHTML=`<h2>${id?"Edit":"Add"} ${e.title}</h2>${x}<div class="err" id="fe"></div><div class="row" style="margin-top:14px"><button class="p" onclick="commit('${k}','${id||""}')">Save</button><button onclick="closeM()">Cancel</button></div>`;$("#md").style.display="flex"}
const closeM=()=>$("#md").style.display="none";
async function commit(k,id){const e=E[k]||{col:"clients",f:[["name"],["company"],["email"],["phone"]]},o={};
  for(const f of e.f){const t=f[2],n=f[0];o[n]=t=="multi"?[...document.getElementsByName("f_"+n)].filter(i=>i.checked).map(i=>i.value):t=="number"?+$("#f_"+n).value||0:$("#f_"+n).value}
  if(k=="projects")o.pr=Math.max(0,Math.min(100,o.pr));
  const old=DB[e.col].find(x=>x.id==id)||{};
  if(k=="clients"){o.uid=$("#f_uid").value.trim();if(!o.company||!o.uid)return $("#fe").textContent="Company & User ID required";
    if(DB.clients.some(c=>c.uid==o.uid&&c.id!=id))return $("#fe").textContent="User ID already used";
    const pw=$("#f_pw").value;if(!id&&!pw)return $("#fe").textContent="Password required";o.pw=pw?await hash(pw):old.pw;o.perms={};PG.forEach(([a])=>o.perms[a]=$("#p_"+a).value)}
  else if(!(o.name||o.title||o.item||o.pid))return $("#fe").textContent="Please fill details";
  if(id)Object.assign(old,o);else DB[e.col].push({id:uid(),...o});closeM();rr()}
function del(k,id){ask("Delete permanently?",()=>del0(k,id))}
function del0(k,id){const c=(E[k]||{col:"clients"}).col;DB[c]=DB[c].filter(x=>x.id!=id);
  if(k=="projects"){["tasks","costs","payments"].forEach(t=>DB[t]=DB[t].filter(x=>x.pid!=id))}if(k=="clients"){DB.projects.filter(p=>p.cid==id).forEach(p=>del2(p.id));}closeM();rr()}
const del2=id=>{DB.projects=DB.projects.filter(p=>p.id!=id);["tasks","costs","payments"].forEach(t=>DB[t]=DB[t].filter(x=>x.pid!=id))};
/* ---------- Pages ---------- */
function clients(){return`<div class="card">${head("Client management","clients")}${tbl(["Company","Contact","Login ID","Projects","Outstanding","Shared sections",""],DB.clients.map(c=>{const ps=DB.projects.filter(p=>p.cid==c.id),o=ps.reduce((a,p)=>a+cost(p.id)-paid(p.id),0);
  return[`<b>${esc(c.company)}</b>`,esc(c.name)+`<div class="mu">${esc(c.email)} · ${esc(c.phone)}</div>`,esc(c.uid),ps.length,inr(o),PG.filter(([a])=>c.perms[a]&&c.perms[a]!="none").map(([a])=>a).join(", ")||"-",acts("clients",c.id)]}))}</div>`}
function services(){const ad=adm();return`<div class="card">${head(ad?"Service management":"Assigned services",ad?"services":"")}${ad?tbl(["Service","Description","Price",""],DB.services.map(s=>[esc(s.name),esc(s.desc),inr(s.price),acts("services",s.id)]))
  :tbl(["Project","Services"],prj().map(p=>[esc(p.name),esc(sn(p.sids))]))}</div>`}
function projects(){const ad=adm(),e=ad||full(me(),"projects")==2;return`<div class="card">${head(ad?"Project management":"My projects",ad?"projects":"")}${tbl([...(ad?["Client"]:[]),"Project","Services","Status","Progress","Due","Notes",""],prj().map(p=>[...(ad?[esc(cn(p.cid))]:[]),`<b>${esc(p.name)}</b>`,esc(sn(p.sids)),st(p.status),bar(p.pr),fd(p.due),esc(p.note),ad?acts("projects",p.id):e?`<button class="s" onclick="fb('${p.id}')">Feedback</button>`:""]))}</div>`}
function fb(id){const p=DB.projects.find(x=>x.id==id);$("#mb").innerHTML=`<h2>Feedback / note</h2><textarea id="fbt">${esc(p.note)}</textarea><div class="row" style="margin-top:12px"><button class="p" onclick="DB.projects.find(x=>x.id=='${id}').note=$('#fbt').value;closeM();rr()">Save</button><button onclick="closeM()">Cancel</button></div>`;$("#md").style.display="flex"}
let okf=null;function ask(m,f){okf=f;$("#mb").innerHTML=`<h2>${m}</h2><div class="row" style="margin-top:12px"><button class="p" onclick="okf();okf=null">Yes</button><button onclick="closeM()">Cancel</button></div>`;$("#md").style.display="flex"}
function tasks(){const ad=adm(),e=ad||full(me(),"tasks")==2,T=DB.tasks.filter(inP);return`<div class="card">${head(ad?"Task management":"Tasks",e?"tasks":"")}${tbl(["Project","Task","Owner","Due","Status",""],T.map(t=>[esc(pn(t.pid)),esc(t.title),t.who=="Admin"?"Agency":"Client",fd(t.due),e?`<select onchange="DB.tasks.find(x=>x.id=='${t.id}').status=this.value;rr()" style="width:130px">${["Pending","In Progress","Done"].map(s=>`<option ${s==t.status?"selected":""}>${s}</option>`).join("")}</select>`:st(t.status),ad?acts("tasks",t.id):""]))}</div>`}
function costing(){const ad=adm();return`<div class="card">${head("Project costing",ad?"costs":"")}${tbl(["Project","Cost item","Amount",""],DB.costs.filter(inP).map(c=>[esc(pn(c.pid)),esc(c.item),inr(c.amt),ad?acts("costs",c.id):""]))}</div>
  <div class="card"><h2>Cost summary</h2>${tbl(["Project","Total cost","Paid","Outstanding"],prj().map(p=>[esc(p.name),inr(cost(p.id)),inr(paid(p.id)),inr(cost(p.id)-paid(p.id))]))}
  ${ad?`<p><button onclick="autoCost()">Auto-add cost lines from assigned services</button> <span class="mu">(sirf un projects me jinki costing abhi khali hai)</span></p>`:""}</div>`}
function autoCost(){DB.projects.forEach(p=>{if(!DB.costs.some(c=>c.pid==p.id))(p.sids||[]).forEach(s=>{const v=DB.services.find(x=>x.id==s);if(v)DB.costs.push({id:uid(),pid:p.id,item:v.name,amt:v.price})})});rr()}
function payments(){const ad=adm(),P=DB.payments.filter(inP).sort((a,b)=>a.date<b.date?1:-1);return`<div class="card">${head("Payment tracking",ad?"payments":"")}${tbl(["Date","Project","Amount","Mode",""],P.map(x=>[fd(x.date),esc(pn(x.pid)),inr(x.amt),esc(x.mode),ad?acts("payments",x.id):""]))}</div>
  <div class="card"><h2>Status by project</h2>${tbl(["Project","Cost","Paid","Outstanding","Status"],prj().map(p=>{const c=cost(p.id),d=paid(p.id);return[esc(p.name),inr(c),inr(d),inr(c-d),`<span class="chip ${c&&d>=c?"g":d?"o":"r"}">${c&&d>=c?"Paid":d?"Partial":"Unpaid"}</span>`]}))}</div>`}
function reports(){const ad=adm(),pay=DB.payments.filter(inP),ms=[...Array(6)].map((_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);const k=d.toISOString().slice(0,7);return[d.toLocaleString("en",{month:"short"}),pay.filter(x=>x.date.startsWith(k)).reduce((a,x)=>a+ +x.amt,0)]}),mx=Math.max(1,...ms.map(x=>x[1]));
  const T=id=>{const t=DB.tasks.filter(x=>x.pid==id);return t.filter(x=>x.status=="Done").length+"/"+t.length};
  return`<div class="card"><h2>Monthly revenue (6 months)</h2><div class="mb">${ms.map(([m,v])=>`<div><i style="height:${v/mx*80}px"></i>${m}<br>${inr(v)}</div>`).join("")}</div></div>
  <div class="card"><h2>Project-wise report</h2>${tbl([...(ad?["Client"]:[]),"Project","Status","Progress","Tasks done","Cost","Paid","Outstanding"],prj().map(p=>[...(ad?[esc(cn(p.cid))]:[]),esc(p.name),st(p.status),bar(p.pr),T(p.id),inr(cost(p.id)),inr(paid(p.id)),inr(cost(p.id)-paid(p.id))]))}</div>
  ${ad?`<div class="card"><h2>Client-wise report</h2>${tbl(["Client","Projects","Active","Total cost","Paid","Outstanding"],DB.clients.map(c=>{const ps=DB.projects.filter(p=>p.cid==c.id),t=ps.reduce((a,p)=>a+cost(p.id),0),d=ps.reduce((a,p)=>a+paid(p.id),0);return[esc(c.company),ps.length,ps.filter(p=>p.status=="Active").length,inr(t),inr(d),inr(t-d)]}))}</div>`:""}`}
function dbp(){return`<div class="card"><h2>Common Project Database</h2><input placeholder="Search client / project / service…" oninput="q(this.value)">
  <div id="dbt">${dbt("")}</div></div>`}
const dbt=s=>tbl(["Client","Project","Services","Status","Progress","Start","Due","Tasks","Cost","Paid","Outstanding"],DB.projects.filter(p=>(cn(p.cid)+p.name+sn(p.sids)).toLowerCase().includes(s.toLowerCase())).map(p=>{const t=DB.tasks.filter(x=>x.pid==p.id);return[esc(cn(p.cid)),esc(p.name),esc(sn(p.sids)),st(p.status),p.pr+"%",fd(p.start),fd(p.due),t.filter(x=>x.status=="Done").length+"/"+t.length,inr(cost(p.id)),inr(paid(p.id)),inr(cost(p.id)-paid(p.id))]}));
const q=s=>$("#dbt").innerHTML=dbt(s);
function pw(){return`<div class="card" style="max-width:420px"><h2>Admin settings</h2><label>New admin password</label><input id="np" type="text"><button class="p" style="margin-top:10px" onclick="chg()">Update password</button><div class="mu" id="pm"></div>
  <hr style="border:0;border-top:1px solid var(--ln);margin:16px 0"><button class="d" onclick="ask('Saara data reset hoga. Continue?',()=>{try{localStorage.removeItem('pms_db')}catch(e){}DB=null;closeM();init()})">Reset demo data</button></div>`}
async function chg(){const v=$("#np").value;if(v.length<6)return $("#pm").textContent="Min 6 characters";DB.admin.pw=await hash(v);save();$("#pm").textContent="Password updated"}
init();
