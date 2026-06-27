import { useState, useEffect, useMemo, useRef } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MIC_ITEMS = ["Deposit collected","Contract signed","Room key given","Move-in confirmed","First month paid","Rules explained"];
const TABS = ["Dashboard","Tenants","Billing","KWH","Invoice","Rooms","Finance","History"];
const METHODS = ["gcash","maya","cash","sterling","gotyme","other"];

function pad(n){ return String(n).padStart(2,"0"); }
function lastDay(y,m){ return new Date(y,m+1,0).toISOString().split("T")[0]; }
function curMonth(){ const t=new Date(); return `${t.getFullYear()}-${pad(t.getMonth()+1)}`; }
function nextMonth(ym){ const[y,m]=ym.split("-").map(Number); const d=new Date(y,m,1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function peso(n){ return "₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtMonth(m){ const[y,mo]=m.split("-"); return MONTHS[parseInt(mo)-1]+" "+y; }
function todayStr(){ return new Date().toISOString().split("T")[0]; }
function diffDays(d1,d2){ return Math.round((new Date(d2)-new Date(d1))/(1000*60*60*24)); }

const LS = {
  get:(k)=>{ try{ return JSON.parse(localStorage.getItem("bh8_"+k)||"null"); }catch(e){ return null; } },
  set:(k,v)=>{ try{ localStorage.setItem("bh8_"+k,JSON.stringify(v)); }catch(e){} }
};

// ─── Theme ───────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#0f1117", bg2:"#1a1d27", bg3:"#22263a", bg4:"#2a2f45",
  border:"#2e3352", border2:"#3d4466",
  text:"#f1f3f9", text2:"#9ba3c0", text3:"#6b7494",
  green:"#22c55e", gbg:"rgba(34,197,94,.12)", gbr:"rgba(34,197,94,.3)",
  red:"#f43f5e", rbg:"rgba(244,63,94,.12)", rbr:"rgba(244,63,94,.3)",
  amber:"#f59e0b", abg:"rgba(245,158,11,.12)", abr:"rgba(245,158,11,.3)",
  blue:"#3b82f6", bbg:"rgba(59,130,246,.12)", bbr:"rgba(59,130,246,.3)",
  purple:"#a855f7", pbg:"rgba(168,85,247,.12)",
  card:"#1a1d27", modal:"#1a1d27", input:"#22263a",
};
const LIGHT = {
  bg:"#f4f6fb", bg2:"#ffffff", bg3:"#f0f2f8", bg4:"#e4e7f0",
  border:"#dde1ef", border2:"#c8cde0",
  text:"#1a1d27", text2:"#4b5470", text3:"#8b95b5",
  green:"#16a34a", gbg:"rgba(22,163,74,.1)", gbr:"rgba(22,163,74,.3)",
  red:"#dc2626", rbg:"rgba(220,38,38,.1)", rbr:"rgba(220,38,38,.3)",
  amber:"#d97706", abg:"rgba(217,119,6,.1)", abr:"rgba(217,119,6,.3)",
  blue:"#2563eb", bbg:"rgba(37,99,235,.1)", bbr:"rgba(37,99,235,.3)",
  purple:"#9333ea", pbg:"rgba(147,51,234,.1)",
  card:"#ffffff", modal:"#ffffff", input:"#f0f2f8",
};

// ─── Reliability helper ───────────────────────────────────────────────────────
function getReliability(roomBills){
  if(!roomBills||roomBills.length===0) return {label:"No data",color:"#6b7494",score:0};
  const total = roomBills.length;
  const onTime = roomBills.filter(b=>{
    if(b.status!=="paid"||!b.datePaid||!b.dueDate) return false;
    return b.datePaid<=b.dueDate;
  }).length;
  const paid = roomBills.filter(b=>b.status==="paid").length;
  const score = Math.round((paid/total)*100);
  if(score>=90) return {label:"Excellent payer",color:"#22c55e",score};
  if(score>=70) return {label:"Good payer",color:"#f59e0b",score};
  if(score>=50) return {label:"Sometimes late",color:"#f97316",score};
  return {label:"Frequently late",color:"#f43f5e",score};
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const today = new Date();
  const [darkMode, setDarkMode] = useState(LS.get("darkMode")!==false);
  const T = darkMode ? DARK : LIGHT;

  const [tab, setTab] = useState(0);
  const [tenants, setTenants] = useState(LS.get("tenants")||[]);
  const [bills, setBills] = useState(LS.get("bills")||[]);
  const [expenses, setExpenses] = useState(LS.get("expenses")||[]);
  const [kwhData, setKwhData] = useState(LS.get("kwh")||{});
  const [transfers, setTransfers] = useState(LS.get("transfers")||{});
  const [mic, setMic] = useState(LS.get("mic")||{});
  const [kwhRate, setKwhRate] = useState(LS.get("kwhRate")||15);
  const [activeBillingMonth, setActiveBillingMonth] = useState(curMonth());
  const [invRoom, setInvRoom] = useState("");
  const [finMonth, setFinMonth] = useState(curMonth());
  const [histRoom, setHistRoom] = useState("");
  const [histYear, setHistYear] = useState(String(today.getFullYear()));
  const [search, setSearch] = useState("");
  const [profileTenant, setProfileTenant] = useState(null);
  const [readmeOpen, setReadmeOpen] = useState(false);

  // Modals
  const [tenantModal, setTenantModal] = useState(false);
  const [editTenantIdx, setEditTenantIdx] = useState(-1);
  const [billModal, setBillModal] = useState(false);
  const [expModal, setExpModal] = useState(false);
  const [backupModal, setBackupModal] = useState(false);
  const [prevBillModal, setPrevBillModal] = useState(false);

  // Forms
  const [tForm, setTF] = useState({room:"",name:"",phone:"",type:"old",moveIn:todayStr(),contractEnd:"",rent:"",water:"",wifi:"",deposit:"",depStatus:"held",status:"occupied",notes:"",moveOutDate:""});
  const [tMic, setTMic] = useState({});
  const [bForm, setBF] = useState({room:"",month:curMonth(),datePaid:todayStr(),rent:"",elec:"",water:"",wifi:"",amtPaid:"",status:"unpaid",method:"gcash",notes:""});
  const [balances, setBalances] = useState([]);
  const [eForm, setEF] = useState({desc:"",amt:"",date:todayStr(),cat:"Electric"});
  const [prevBillForm, setPBF] = useState({room:"",month:"",datePaid:"",rent:"",elec:"",water:"",wifi:"",status:"paid",method:"gcash",notes:""});
  const [prevBillBals, setPrevBillBals] = useState([]);
  const importRef = useRef();

  // Save helpers
  const sv = (key,val,setter) => { setter(val); LS.set(key,val); };
  const saveTenants = v => sv("tenants",v,setTenants);
  const saveBills = v => sv("bills",v,setBills);
  const saveExpenses = v => sv("expenses",v,setExpenses);
  const saveKwh = v => sv("kwh",v,setKwhData);
  const saveTransfers = v => sv("transfers",v,setTransfers);
  const saveMic = v => sv("mic",v,setMic);

  const cm = curMonth();
  const due = lastDay(today.getFullYear(), today.getMonth());
  const curBills = bills.filter(b=>b.month===cm);
  const paid = curBills.filter(b=>b.status==="paid");
  const unpaid = curBills.filter(b=>b.status!=="paid");
  const overdueList = unpaid.filter(b=>todayStr()>due);
  const allBillingMonths = [...new Set([cm,...bills.map(b=>b.month)])].sort((a,z)=>z.localeCompare(a)).slice(0,24);
  const [y2,m2] = activeBillingMonth.split("-").map(Number);
  const billingDue = lastDay(y2,m2-1);
  const billingCur = bills.filter(b=>b.month===activeBillingMonth).sort((a,z)=>a.room-z.room);
  const selYear = finMonth.slice(0,4);
  const yearMonths = Array.from({length:12},(_,i)=>`${selYear}-${pad(i+1)}`);
  const finBills = bills.filter(b=>b.month===finMonth);
  const finExp = expenses.filter(e=>e.date?.slice(0,7)===finMonth).reduce((a,e)=>a+e.amt,0);
  const finGross = finBills.reduce((a,b)=>a+b.total,0);
  const collectionRate = finBills.length>0 ? Math.round((finBills.filter(b=>b.status==="paid").reduce((a,b)=>a+b.total,0)/finGross)*100)||0 : 0;
  const allHistYears = [...new Set([String(today.getFullYear()),...bills.map(b=>b.month.slice(0,4))])].sort((a,z)=>z-a);
  const histFiltered = bills.filter(b=>b.month.startsWith(histYear)&&(!histRoom||b.room==histRoom)).sort((a,z)=>z.month.localeCompare(a.month));
  const histByRoom = useMemo(()=>{const m={};histFiltered.forEach(b=>{if(!m[b.room])m[b.room]=[];m[b.room].push(b);});return m;},[histFiltered]);

  const billTotal = (bf,bals) => {
    const v=f=>parseFloat(bf[f])||0;
    const bt=bals.reduce((a,b)=>a+(parseFloat(b.amt)||0),0);
    return (v("rent")+v("elec")+v("water")+v("wifi")+bt).toFixed(2);
  };

  // Auto-generate on mount if no bills this month
  useEffect(()=>{
    if(curBills.length===0 && tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").length>0){
      // silently generate
      const active=tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out");
      const newBills=[...bills];
      active.forEach(t=>{
        if(newBills.find(b=>b.room===t.room&&b.month===cm)) return;
        const k=kwhData["r"+t.room]||{};
        const prev=[...newBills].filter(b=>b.room===t.room&&b.month<cm).sort((a,z)=>z.month.localeCompare(a.month))[0];
        const pb=prev?.status!=="paid"&&prev?.balances?prev.balances.map(bl=>({desc:"Carry: "+bl.desc,amt:bl.amt})):[];
        const bt=pb.reduce((a,b)=>a+b.amt,0);
        newBills.push({room:t.room,name:t.name,month:cm,datePaid:"",dueDate:due,rent:t.rent||0,elec:parseFloat((k.bill||0).toFixed(2)),water:t.water||0,wifi:t.wifi||0,balances:pb,balTotal:bt,total:(t.rent||0)+parseFloat((k.bill||0).toFixed(2))+(t.water||0)+(t.wifi||0)+bt,amtPaid:0,status:"unpaid",method:"",notes:""});
      });
      saveBills(newBills);
    }
  },[]);

  function genBills(silent=false){
    const active=tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out");
    if(!active.length){if(!silent)alert("No active tenants.");return;}
    let created=0,skipped=0;
    const newBills=[...bills];
    active.forEach(t=>{
      if(newBills.find(b=>b.room===t.room&&b.month===cm)){skipped++;return;}
      const k=kwhData["r"+t.room]||{};
      const prev=[...newBills].filter(b=>b.room===t.room&&b.month<cm).sort((a,z)=>z.month.localeCompare(a.month))[0];
      const pb=prev?.status!=="paid"&&prev?.balances?prev.balances.map(bl=>({desc:"Carry: "+bl.desc,amt:bl.amt})):[];
      const bt=pb.reduce((a,b)=>a+b.amt,0);
      newBills.push({room:t.room,name:t.name,month:cm,datePaid:"",dueDate:due,rent:t.rent||0,elec:parseFloat((k.bill||0).toFixed(2)),water:t.water||0,wifi:t.wifi||0,balances:pb,balTotal:bt,total:(t.rent||0)+parseFloat((k.bill||0).toFixed(2))+(t.water||0)+(t.wifi||0)+bt,amtPaid:0,status:"unpaid",method:"",notes:""});
      created++;
    });
    saveBills(newBills);
    if(!silent) alert(`Generated ${created} bill(s).${skipped>0?` ${skipped} already existed.`:""}`);
  }

  function openTenantModal(idx){
    setEditTenantIdx(idx==null?-1:idx);
    const t=idx!=null?tenants[idx]:{};
    setTF({room:t.room||"",name:t.name||"",phone:t.phone||"",type:t.type||"old",moveIn:t.moveIn||todayStr(),contractEnd:t.contractEnd||"",rent:t.rent||"",water:t.water||"",wifi:t.wifi||"",deposit:t.deposit||"",depStatus:t.depStatus||"held",status:t.status||"occupied",notes:t.notes||"",moveOutDate:t.moveOutDate||""});
    setTMic(mic["m"+(t.room||"")]||{});
    setTenantModal(true);
  }
  function saveTenant(){
    const room=parseInt(tForm.room);
    if(!room||!tForm.name.trim()){alert("Enter room # and name");return;}
    const t={...tForm,room,moveOutDate:tForm.moveOutDate||"",rent:parseFloat(tForm.rent)||0,water:parseFloat(tForm.water)||0,wifi:parseFloat(tForm.wifi)||0,deposit:parseFloat(tForm.deposit)||0};
    const newT=editTenantIdx>=0?tenants.map((x,i)=>i===editTenantIdx?t:x):[...tenants,t];
    newT.sort((a,b)=>a.room-b.room);
    saveTenants(newT);
    saveMic({...mic,["m"+room]:tMic});
    setTenantModal(false);
  }

  function openBillModal(room,month){
    const b=month?bills.find(x=>x.room==room&&x.month===month):null;
    if(b){
      setBF({room:b.room,month:b.month,datePaid:b.datePaid||todayStr(),rent:b.rent||"",elec:b.elec||"",water:b.water||"",wifi:b.wifi||"",amtPaid:b.amtPaid||"",status:b.status||"unpaid",method:b.method||"gcash",notes:b.notes||""});
      setBalances(b.balances||[]);
    } else {
      const t=tenants.find(x=>x.room===room);
      const k=kwhData["r"+room]||{};
      const prev=[...bills].filter(b=>b.room===room&&b.month<cm).sort((a,z)=>z.month.localeCompare(a.month))[0];
      const pb=prev?.status!=="paid"&&prev?.balances?prev.balances.map(bl=>({desc:"Carry: "+bl.desc,amt:bl.amt})):[];
      setBF({room:room||"",month:cm,datePaid:todayStr(),rent:t?.rent||"",elec:k.bill?k.bill.toFixed(2):"",water:t?.water||"",wifi:t?.wifi||"",amtPaid:"",status:"unpaid",method:"gcash",notes:""});
      setBalances(pb);
    }
    setBillModal(true);
  }

  function saveBill(){
    const room=parseInt(bForm.room);
    if(!room){alert("Select a room");return;}
    const t=tenants.find(x=>x.room===room);
    const bt=balances.reduce((a,b)=>a+(parseFloat(b.amt)||0),0);
    const month=bForm.month||cm;
    const[by,bm]=month.split("-").map(Number);
    const bDue=lastDay(by,bm-1);
    const b={room,name:t?.name||"",month,datePaid:bForm.datePaid,dueDate:bDue,rent:parseFloat(bForm.rent)||0,elec:parseFloat(bForm.elec)||0,water:parseFloat(bForm.water)||0,wifi:parseFloat(bForm.wifi)||0,balances,balTotal:bt,total:parseFloat(billTotal(bForm,balances)),amtPaid:parseFloat(bForm.amtPaid)||0,status:bForm.status,method:bForm.method,notes:bForm.notes};
    const ei=bills.findIndex(x=>x.room===room&&x.month===month);
    saveBills(ei>=0?bills.map((x,i)=>i===ei?b:x):[...bills,b]);
    setBillModal(false);
  }

  function savePrevBill(){
    const room=parseInt(prevBillForm.room);
    if(!room||!prevBillForm.month){alert("Select room and month");return;}
    const t=tenants.find(x=>x.room===room);
    const bt=prevBillBals.reduce((a,b)=>a+(parseFloat(b.amt)||0),0);
    const[by,bm]=prevBillForm.month.split("-").map(Number);
    const bDue=lastDay(by,bm-1);
    const b={room,name:t?.name||"",month:prevBillForm.month,datePaid:prevBillForm.datePaid,dueDate:bDue,rent:parseFloat(prevBillForm.rent)||0,elec:parseFloat(prevBillForm.elec)||0,water:parseFloat(prevBillForm.water)||0,wifi:parseFloat(prevBillForm.wifi)||0,balances:prevBillBals,balTotal:bt,total:parseFloat(billTotal(prevBillForm,prevBillBals)),amtPaid:parseFloat(prevBillForm.amtPaid)||0,status:prevBillForm.status,method:prevBillForm.method,notes:prevBillForm.notes};
    const ei=bills.findIndex(x=>x.room===room&&x.month===prevBillForm.month);
    saveBills(ei>=0?bills.map((x,i)=>i===ei?b:x):[...bills,b]);
    setPrevBillModal(false);
    alert(`Saved bill for ${fmtMonth(prevBillForm.month)} - Room ${room}`);
  }

  function applyKWH(room){
    const k=kwhData["r"+room];
    if(!k?.curr){alert("Enter readings first");return;}
    const nm=nextMonth(cm);
    const newBills=bills.map(b=>{
      if(b.room===room&&b.month===cm){const elec=parseFloat(k.bill.toFixed(2));return {...b,elec,total:b.rent+elec+b.water+b.wifi+(b.balTotal||0)};}
      return b;
    });
    saveBills(newBills);
    const prev=k.pfm?.[cm]??k.prev??0;
    const entry={month:cm,prev,curr:k.curr,kwh:k.kwh,bill:k.bill};
    const hist=[...(k.hist||[])];
    const ei=hist.findIndex(h=>h.month===cm);
    if(ei>=0)hist[ei]=entry;else hist.push(entry);
    saveKwh({...kwhData,["r"+room]:{...k,hist,pfm:{...(k.pfm||{}),[nm]:k.curr},prev:k.curr}});
    LS.set("kwhRate",kwhRate);
    alert(`Applied ${peso(k.bill)} to Room ${room}. Next month prev → ${k.curr}`);
  }

  function updKWH(room,field,val){
    const k=kwhData["r"+room]||{};
    let upd={...k};
    if(field==="prev"){upd.pfm={...(k.pfm||{}),[cm]:parseFloat(val)||0};upd.prev=parseFloat(val)||0;}
    else{upd.curr=parseFloat(val)||0;}
    const prev=upd.pfm?.[cm]??upd.prev??0;
    const kwhu=Math.max(0,(upd.curr||0)-prev);
    upd.kwh=kwhu;upd.bill=kwhu*kwhRate;
    saveKwh({...kwhData,["r"+room]:upd});
  }

  function togTr(tkey,field){
    const cur=transfers[tkey]||{};
    saveTransfers({...transfers,[tkey]:{...cur,[field]:!cur[field]}});
  }

  function qBal(room,month){
    const desc=prompt("Balance description:","Balance");if(!desc)return;
    const amt=parseFloat(prompt("Amount (₱):","0")||0);
    saveBills(bills.map(b=>{
      if(b.room===room&&b.month===month){
        const newBals=[...(b.balances||[]),{desc,amt}];
        const bt=newBals.reduce((a,x)=>a+x.amt,0);
        return {...b,balances:newBals,balTotal:bt,total:b.rent+b.elec+b.water+b.wifi+bt};
      }
      return b;
    }));
  }

  function copySMS(room){
    if(!room){alert("Select a room first");return;}
    const t=tenants.find(x=>x.room===room);
    const b=bills.find(x=>x.room===room&&x.month===cm);
    const k=kwhData["r"+room]||{};
    const elec=b?b.elec:(k.bill||0),water=b?b.water:(t?.water||0),wifi=b?b.wifi:(t?.wifi||0),rent=b?b.rent:(t?.rent||0);
    const bt=(b?.balances||[]).reduce((a,x)=>a+(parseFloat(x.amt)||0),0);
    const total=rent+elec+water+wifi+bt;
    const txt=`Hi ${t?.name||""}! Your bill for ${fmtMonth(cm)}:\n\nRoom: ${peso(rent)}\nElectric: ${peso(elec)} (${k.kwh||0}kwh)\nWater: ${peso(water)}\nWifi: ${peso(wifi)}${bt?`\nBalance: ${peso(bt)}`:""}\n\nTOTAL: ${peso(total)}\nDue: ${due}\n\nThank you!`;
    navigator.clipboard.writeText(txt).then(()=>alert("Copied! Paste to SMS.")).catch(()=>prompt("Copy:",txt));
  }

  function exportCSV(rows,fn){
    const csv=rows.map(r=>Array.isArray(r)?r.map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(","):"").join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=fn;a.click();
  }

  function backupData(){
    const data={tenants,bills,expenses,kwhData,transfers,mic,kwhRate,exportedAt:new Date().toISOString(),version:"bh8"};
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=`BoardingHouse_Backup_${todayStr()}.json`;a.click();
  }

  function restoreData(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(!data.version?.startsWith("bh")){alert("Invalid backup file.");return;}
        if(!confirm(`Restore backup from ${data.exportedAt?.slice(0,10)||"unknown date"}? This will replace all current data.`))return;
        saveTenants(data.tenants||[]);saveBills(data.bills||[]);saveExpenses(data.expenses||[]);
        saveKwh(data.kwhData||{});saveTransfers(data.transfers||{});saveMic(data.mic||{});
        setKwhRate(data.kwhRate||15);
        alert("Backup restored successfully!");setBackupModal(false);
      }catch(err){alert("Failed to read backup file.");}
    };
    reader.readAsText(file);
  }

  function printAllInvoices(){
    const cmo=cm;
    const allBills=bills.filter(b=>b.month===cmo);
    if(!allBills.length){alert("No bills this month.");return;}
    const win=window.open("","_blank");
    const rows=allBills.map(b=>{
      const t=tenants.find(x=>x.room===b.room);
      const k=kwhData["r"+b.room]||{};
      return `<div style="page-break-after:always;padding:24px;font-family:Arial,sans-serif;max-width:400px;margin:0 auto;border:1px solid #ccc;border-radius:8px;margin-bottom:20px">
        <div style="text-align:center;border-bottom:2px solid #16a34a;padding-bottom:10px;margin-bottom:12px">
          <div style="font-size:20px;font-weight:800;color:#16a34a">BOARDING HOUSE</div>
          <div style="font-size:13px;font-weight:700;margin-top:3px">${fmtMonth(b.month)}</div>
          <div style="font-size:11px;color:#666">${new Date().toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
        <div style="background:#f5f5f5;border-radius:6px;padding:8px 10px;margin-bottom:10px">
          <div style="font-size:14px;font-weight:700">Room ${b.room} — ${t?.name||"—"}</div>
          ${t?.phone?`<div style="font-size:11px;color:#666">${t.phone}</div>`:""}
        </div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:4px">Electricity</div>
        ${[["Previous",k.prev||0],["Current",k.curr||0],["KWH used",`${k.kwh||0} kwh`],["Rate",`₱${kwhRate}/kwh`],["Electric bill",peso(b.elec)]].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;font-size:12px"><span style="color:#666">${l}</span><span>${v}</span></div>`).join("")}
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#888;margin:8px 0 4px">Charges</div>
        ${[["Water",peso(b.water)],["Room rent",peso(b.rent)],["Wifi",peso(b.wifi)]].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;font-size:12px"><span style="color:#666">${l}</span><span>${v}</span></div>`).join("")}
        ${(b.balances||[]).length?`<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#888;margin:8px 0 4px">Balances</div>${(b.balances||[]).map(bl=>`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;font-size:12px"><span style="color:#666">${bl.desc}</span><span style="color:#d97706">${peso(bl.amt)}</span></div>`).join("")}`:""}
        <div style="display:flex;justify-content:space-between;padding:10px 0 3px;font-size:15px;font-weight:800;border-top:2px solid #ccc;margin-top:8px;color:#16a34a"><span>Total due</span><span>${peso(b.total)}</span></div>
        <div style="text-align:center;margin-top:10px;font-size:11px;font-weight:600;color:#d97706">Due on or before ${b.dueDate}</div>
        <div style="text-align:center;margin-top:6px;font-size:11px;color:#888">Status: <strong style="color:${b.status==="paid"?"#16a34a":b.status==="balance"?"#d97706":"#dc2626"}">${b.status.toUpperCase()}</strong></div>
      </div>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>All Invoices - ${fmtMonth(cmo)}</title><style>body{margin:0;padding:20px;background:#f9f9f9}@media print{.no-print{display:none}}</style></head><body><div class="no-print" style="text-align:center;margin-bottom:20px"><button onclick="window.print()" style="padding:10px 20px;font-size:14px;font-weight:700;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨 Print All</button></div>${rows}</body></html>`);
    win.document.close();
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    app:{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",fontSize:14,transition:"background .2s,color .2s"},
    topbar:{background:T.bg2,borderBottom:`1px solid ${T.border}`,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"},
    nav:{background:T.bg2,borderBottom:`1px solid ${T.border}`,display:"flex",overflowX:"auto",padding:"0 6px"},
    navBtn:(active)=>({padding:"10px 11px",fontSize:12,fontWeight:600,border:"none",background:"none",cursor:"pointer",color:active?T.green:T.text3,borderBottom:active?`2px solid ${T.green}`:"2px solid transparent",whiteSpace:"nowrap",fontFamily:"inherit",transition:"color .15s",position:"relative"}),
    content:{padding:14,background:T.bg},
    card:{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,marginBottom:10},
    label:{fontSize:12,fontWeight:600,color:T.text2,display:"block",marginBottom:3,marginTop:8},
    input:{width:"100%",padding:"8px 10px",border:`1px solid ${T.border2}`,borderRadius:8,fontSize:13,color:T.text,background:T.input,fontFamily:"inherit",boxSizing:"border-box",outline:"none"},
    select:{width:"100%",padding:"8px 10px",border:`1px solid ${T.border2}`,borderRadius:8,fontSize:13,color:T.text,background:T.input,fontFamily:"inherit",boxSizing:"border-box"},
    btn:(bg,col)=>({padding:"8px 14px",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit",background:bg,color:col,display:"inline-flex",alignItems:"center",gap:5}),
    btnSm:(bg,col,border)=>({padding:"5px 10px",border:border?`1px solid ${border}`:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",background:bg,color:col}),
    badge:(bg,col)=>({display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:bg,color:col}),
    stat:(accent)=>({background:T.card,border:`1px solid ${T.border}`,borderLeft:`3px solid ${accent}`,borderRadius:10,padding:12}),
    overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,overflowY:"auto",padding:16},
    modal:{background:T.modal,border:`1px solid ${T.border2}`,borderRadius:14,padding:18,width:"100%",maxWidth:520,margin:"20px auto"},
    g2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},
    divider:{height:1,background:T.border,margin:"12px 0"},
    sectionLabel:{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.6,color:T.text3,margin:"14px 0 8px",display:"flex",alignItems:"center",gap:8},
    thStyle:{padding:"9px 10px",textAlign:"left",color:T.text3,fontSize:10,fontWeight:700,textTransform:"uppercase",background:T.bg3,borderBottom:`1px solid ${T.border}`},
    tdStyle:{padding:"9px 10px",borderBottom:`1px solid ${T.border}`,color:T.text,verticalAlign:"middle"},
  };

  function Inp({label,value,onChange,type="text",placeholder,readOnly,style}){
    return <div><label style={s.label}>{label}</label><input type={type} value={value||""} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly} style={{...s.input,...(readOnly?{background:T.bg4,color:T.text2}:{}),...style}}/></div>;
  }
  function Sel({label,value,onChange,options}){
    return <div><label style={s.label}>{label}</label><select value={value||""} onChange={e=>onChange(e.target.value)} style={s.select}>{options.map(o=>typeof o==="string"?<option key={o} value={o}>{o}</option>:<option key={o.v} value={o.v}>{o.l}</option>)}</select></div>;
  }

  function Modal({open,onClose,title,children,wide}){
    if(!open) return null;
    return <div style={s.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{...s.modal,...(wide?{maxWidth:700}:{})}}> 
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{fontSize:15,fontWeight:700,color:T.text}}>{title}</span>
          <button onClick={onClose} style={{background:T.bg3,border:`1px solid ${T.border}`,color:T.text2,width:28,height:28,borderRadius:7,cursor:"pointer",fontSize:16}}>×</button>
        </div>
        {children}
      </div>
    </div>;
  }

  // ─── Tenant Profile Modal ────────────────────────────────────────────────────
  function TenantProfile({t,onClose}){
    const roomBills=bills.filter(b=>b.room===t.room).sort((a,z)=>z.month.localeCompare(a.month));
    const rel=getReliability(roomBills);
    const totalPaid=roomBills.filter(b=>b.status==="paid").reduce((a,b)=>a+b.total,0);
    const monthsStayed=t.moveIn?Math.max(1,Math.ceil(diffDays(t.moveIn,todayStr())/30)):0;
    const avgMonthly=roomBills.length>0?roomBills.reduce((a,b)=>a+b.total,0)/roomBills.length:0;
    const k=kwhData["r"+t.room]||{};
    return <Modal open={true} onClose={onClose} title={`Room ${t.room} — ${t.name}`} wide>
      {/* Quick Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        <div style={{background:T.bg3,borderRadius:10,padding:10,textAlign:"center"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:T.text3}}>Total paid</div>
          <div style={{fontSize:16,fontWeight:800,color:T.green,marginTop:3}}>{peso(totalPaid)}</div>
        </div>
        <div style={{background:T.bg3,borderRadius:10,padding:10,textAlign:"center"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:T.text3}}>Avg monthly</div>
          <div style={{fontSize:16,fontWeight:800,color:T.blue,marginTop:3}}>{peso(avgMonthly)}</div>
        </div>
        <div style={{background:T.bg3,borderRadius:10,padding:10,textAlign:"center"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:T.text3}}>Months stayed</div>
          <div style={{fontSize:16,fontWeight:800,color:T.amber,marginTop:3}}>{monthsStayed}</div>
        </div>
      </div>
      {/* Reliability */}
      <div style={{background:T.bg3,borderRadius:8,padding:10,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:rel.color}}>{rel.label}</div>
          <div style={{fontSize:11,color:T.text3,marginTop:2}}>{rel.score}% payment rate</div>
        </div>
        <div style={{width:48,height:48,borderRadius:"50%",border:`3px solid ${rel.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:rel.color}}>{rel.score}%</div>
      </div>
      {/* Tenant Info */}
      <div style={{...s.g2,marginBottom:12}}>
        <div style={{fontSize:12,color:T.text2}}><strong>Phone:</strong> {t.phone||"—"}</div>
        <div style={{fontSize:12,color:T.text2}}><strong>Type:</strong> {t.type||"—"}</div>
        <div style={{fontSize:12,color:T.text2}}><strong>Move-in:</strong> {t.moveIn||"—"}</div>
        <div style={{fontSize:12,color:T.text2}}><strong>Contract ends:</strong> {t.contractEnd||"—"}</div>
        <div style={{fontSize:12,color:T.text2}}><strong>Deposit:</strong> {peso(t.deposit)} ({t.depStatus})</div>
        <div style={{fontSize:12,color:T.text2}}><strong>KWH prev:</strong> {k.prev||0} / curr: {k.curr||0}</div>
      </div>
      {t.notes&&<div style={{background:T.abg,border:`1px solid ${T.abr}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:T.amber,marginBottom:12}}><strong>Note:</strong> {t.notes}</div>}
      <div style={s.divider}/>
      {/* Bill History */}
      <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:T.text}}>Payment history ({roomBills.length} records)</div>
      {roomBills.length===0&&<div style={{color:T.text3,fontSize:13}}>No billing records yet.</div>}
      <div style={{maxHeight:300,overflowY:"auto"}}>
        {roomBills.map(b=>{
          const ip=b.status==="paid";
          return <div key={b.month} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:ip?T.green:b.status==="balance"?T.amber:T.red,marginTop:4,flexShrink:0}}/>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{fmtMonth(b.month)}</div>
                <div style={{fontSize:11,color:T.text3,marginTop:1}}>
                  Rm {peso(b.rent)} + Elec {peso(b.elec)} + Water {peso(b.water)} + Wifi {peso(b.wifi)}{b.balTotal?` + Bal ${peso(b.balTotal)}`:""}
                </div>
                <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={s.badge(ip?T.green:b.status==="balance"?T.abg:T.rbg,ip?"#071a0e":b.status==="balance"?T.amber:T.red)}>{b.status}</span>
                  {b.datePaid&&<span style={{fontSize:11,color:T.text3}}>Paid {b.datePaid}</span>}
                  {b.method&&<span style={{...s.badge(T.bg4,T.text2),fontSize:10}}>{b.method}</span>}
                </div>
              </div>
            </div>
            <div style={{fontWeight:800,fontSize:13,color:ip?T.green:T.text}}>{peso(b.total)}</div>
          </div>;
        })}
      </div>
      <div style={{display:"flex",gap:6,marginTop:14,justifyContent:"flex-end"}}>
        <button style={s.btnSm(T.bg3,T.text)} onClick={()=>{setProfileTenant(null);openTenantModal(tenants.findIndex(x=>x.room===t.room));}}>Edit tenant</button>
        <button style={s.btnSm(T.green,"#071a0e")} onClick={onClose}>Close</button>
      </div>
    </Modal>;
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  const filteredTenants = tenants.filter(t=>
    t.name?.toLowerCase().includes(search.toLowerCase())||
    String(t.room).includes(search)
  );

  // Invoice data
  const invTenant=tenants.find(x=>x.room==invRoom);
  const invBill=bills.find(x=>x.room==invRoom&&x.month===cm);
  const invK=kwhData["r"+invRoom]||{};
  const invElec=invBill?invBill.elec:(invK.bill||0),invWater=invBill?invBill.water:(invTenant?.water||0),invWifi=invBill?invBill.wifi:(invTenant?.wifi||0),invRent=invBill?invBill.rent:(invTenant?.rent||0);
  const invBals=invBill?.balances||[];const invBt=invBals.reduce((a,x)=>a+(parseFloat(x.amt)||0),0);
  const invTotal=invRent+invElec+invWater+invWifi+invBt;
  const invDue=lastDay(today.getFullYear(),today.getMonth());
  const invDueLabel=new Date(invDue+"T00:00:00").toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"});
  const mLabel=today.toLocaleDateString("en-PH",{month:"long",year:"numeric"});
  const dLabel=today.toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"});

  return (
    <div style={s.app}>
      {/* Profile Modal */}
      {profileTenant&&<TenantProfile t={profileTenant} onClose={()=>setProfileTenant(null)}/>}

      {/* README Modal */}
      <Modal open={readmeOpen} onClose={()=>setReadmeOpen(false)} title="📘 How to use this app" wide>
        <div style={{fontSize:13,color:T.text2,lineHeight:1.7,maxHeight:400,overflowY:"auto"}}>
          {[["🏠 Dashboard","See all paid and unpaid tenants at a glance. Transfer checklist lets you track which payments you've moved to your bank (room, electric, water, wifi separately). Overdue alerts show automatically."],["👥 Tenants","Add each boarder with their room number, rates, move-in date, and deposit. Click a tenant card to open their full profile with payment history, reliability score, and stats. Add private notes per tenant."],["🧾 Billing","Auto-generate creates all bills for the month in one click. Bills are organized by month tabs — past months are always accessible. Use +bal to add carry-over balances. Green rows = paid, amber = balance, red = overdue."],["⚡ KWH Reader","Enter previous and current meter readings per room. Formula: (Current − Previous) × Rate = Electric bill. Click Apply — the electric amount goes to their bill and the current reading becomes next month's previous automatically."],["📄 Invoice","Select a room to generate their invoice. Copy SMS sends a formatted bill message you can paste directly to their phone. Print opens a printable version."],["💰 Finance","Monthly and yearly income breakdown. Room rent, electric, water, wifi shown separately. Net = Gross − Expenses. Room rent is your net profit (you keep it all). Export CSV for bank records."],["📊 History","Full record of all payments across all months and rooms. Filter by room or year. Export CSV anytime for bank purposes."],["💾 Backup","Go to the backup button (top right) to download all your data as a JSON file. Restore it anytime — especially useful before clearing browser or switching devices."]].map(([title,desc])=>(
            <div key={title} style={{marginBottom:12}}>
              <div style={{fontWeight:700,color:T.text,marginBottom:3}}>{title}</div>
              <div>{desc}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:12,padding:"8px 10px",background:T.abg,border:`1px solid ${T.abr}`,borderRadius:8,fontSize:12,color:T.amber}}>⚠️ Data is saved in your browser. Always backup regularly using the Backup button.</div>
      </Modal>

      {/* Backup Modal */}
      <Modal open={backupModal} onClose={()=>setBackupModal(false)} title="💾 Backup & Restore">
        <div style={{marginBottom:12}}>
          <div style={{fontWeight:700,marginBottom:6,color:T.text}}>Export backup</div>
          <div style={{fontSize:13,color:T.text2,marginBottom:10}}>Downloads all your data (tenants, bills, expenses, KWH history) as a JSON file. Keep this safe!</div>
          <button style={s.btn(T.green,"#071a0e")} onClick={backupData}>⬇ Download backup</button>
        </div>
        <div style={s.divider}/>
        <div>
          <div style={{fontWeight:700,marginBottom:6,color:T.text}}>Restore from backup</div>
          <div style={{fontSize:13,color:T.text2,marginBottom:10}}>⚠️ This will replace ALL current data with the backup file.</div>
          <input ref={importRef} type="file" accept=".json" onChange={restoreData} style={{display:"none"}}/>
          <button style={s.btn(T.amber,"#1c0f00")} onClick={()=>importRef.current?.click()}>⬆ Choose backup file</button>
        </div>
        <div style={{...s.divider}}/>
        <div>
          <div style={{fontWeight:700,marginBottom:6,color:T.text}}>Export all records (CSV)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button style={s.btnSm(T.bg3,T.text)} onClick={()=>{
              const rows=[["BOARDING HOUSE — Full History"],["Exported: "+todayStr()],[],["Month","Room","Name","Type","Due Date","Date Paid","Room Rent","Electric","Water","Wifi","Balance","Total","Status","Method"],...[...bills].sort((a,z)=>a.month.localeCompare(z.month)||a.room-z.room).map(b=>{const t=tenants.find(x=>x.room===b.room);return[fmtMonth(b.month),b.room,b.name,t?.type||"",b.dueDate,b.datePaid||"",b.rent,b.elec,b.water,b.wifi,b.balTotal||0,b.total,b.status,b.method||""];})];
              exportCSV(rows,`AllRecords_${todayStr()}.csv`);
            }}>All billing records CSV</button>
            <button style={s.btnSm(T.bg3,T.text)} onClick={()=>{
              const rows=[["BOARDING HOUSE — All Expenses"],["Exported: "+todayStr()],[],["Date","Description","Category","Amount"],...[...expenses].sort((a,z)=>(a.date||"").localeCompare(z.date||"")).map(e=>[e.date,e.desc,e.cat,e.amt])];
              exportCSV(rows,`AllExpenses_${todayStr()}.csv`);
            }}>All expenses CSV</button>
          </div>
        </div>
      </Modal>

      {/* Previous Bill Modal */}
      <Modal open={prevBillModal} onClose={()=>setPrevBillModal(false)} title="Add Previous Month Bill">
        <div style={{background:T.abg,border:`1px solid ${T.abr}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:T.amber,marginBottom:10}}>Use this to add records from past months you haven't tracked yet.</div>
        <div style={s.g2}>
          <Sel label="Room" value={String(prevBillForm.room)} onChange={v=>setPBF({...prevBillForm,room:parseInt(v)||""})} options={[{v:"",l:"Select..."},...tenants.map(t=>({v:String(t.room),l:`Room ${t.room} – ${t.name}`}))]}/>
          <div><label style={s.label}>Month (YYYY-MM)</label><input type="month" value={prevBillForm.month} onChange={e=>setPBF({...prevBillForm,month:e.target.value})} style={s.input}/></div>
          <Inp label="Date paid" type="date" value={prevBillForm.datePaid} onChange={v=>setPBF({...prevBillForm,datePaid:v})}/>
          <Inp label="Room rent (₱)" type="number" value={prevBillForm.rent} onChange={v=>setPBF({...prevBillForm,rent:v})}/>
          <Inp label="Electric (₱)" type="number" value={prevBillForm.elec} onChange={v=>setPBF({...prevBillForm,elec:v})}/>
          <Inp label="Water (₱)" type="number" value={prevBillForm.water} onChange={v=>setPBF({...prevBillForm,water:v})}/>
          <Inp label="Wifi (₱)" type="number" value={prevBillForm.wifi} onChange={v=>setPBF({...prevBillForm,wifi:v})}/>
          <Inp label="Amount paid (₱)" type="number" value={prevBillForm.amtPaid} onChange={v=>setPBF({...prevBillForm,amtPaid:v})}/>
          <Sel label="Status" value={prevBillForm.status} onChange={v=>setPBF({...prevBillForm,status:v})} options={["paid","balance","unpaid"]}/>
          <Sel label="Method" value={prevBillForm.method} onChange={v=>setPBF({...prevBillForm,method:v})} options={METHODS}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,marginBottom:6}}>
          <span style={{fontSize:13,fontWeight:700,color:T.text}}>Balances</span>
          <button style={s.btnSm(T.bg3,T.text)} onClick={()=>setPrevBillBals([...prevBillBals,{desc:"",amt:""}])}>+ Add</button>
        </div>
        {prevBillBals.map((bl,i)=>(
          <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
            <input placeholder="Description" value={bl.desc} onChange={e=>setPrevBillBals(prevBillBals.map((b,j)=>j===i?{...b,desc:e.target.value}:b))} style={{...s.input,flex:2}}/>
            <input type="number" placeholder="₱" value={bl.amt} onChange={e=>setPrevBillBals(prevBillBals.map((b,j)=>j===i?{...b,amt:e.target.value}:b))} style={{...s.input,width:85}}/>
            <button onClick={()=>setPrevBillBals(prevBillBals.filter((_,j)=>j!==i))} style={{background:T.rbg,color:T.red,border:`1px solid ${T.rbr}`,borderRadius:6,padding:"6px 10px",cursor:"pointer",fontWeight:700}}>×</button>
          </div>
        ))}
        <Inp label="Notes" value={prevBillForm.notes} onChange={v=>setPBF({...prevBillForm,notes:v})} placeholder="Optional notes"/>
        <div style={{background:T.bg3,borderRadius:8,padding:"8px 10px",marginTop:8,fontSize:14,fontWeight:800,color:T.green}}>Total: {peso(billTotal(prevBillForm,prevBillBals))}</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button style={s.btn(T.bg3,T.text)} onClick={()=>setPrevBillModal(false)}>Cancel</button>
          <button style={s.btn(T.green,"#071a0e")} onClick={savePrevBill}>Save record</button>
        </div>
      </Modal>

      {/* Tenant Modal */}
      <Modal open={tenantModal} onClose={()=>setTenantModal(false)} title={editTenantIdx>=0?"Edit Tenant":"Add Tenant"}>
        <div style={s.g2}>
          <Inp label="Room #" type="number" value={tForm.room} onChange={v=>setTF({...tForm,room:v})} placeholder="1"/>
          <Inp label="Full name" value={tForm.name} onChange={v=>setTF({...tForm,name:v})} placeholder="Name"/>
          <Inp label="Cellphone" value={tForm.phone} onChange={v=>setTF({...tForm,phone:v})} placeholder="09XX..."/>
          <Sel label="Tenant type" value={tForm.type} onChange={v=>setTF({...tForm,type:v})} options={[{v:"old",l:"Old tenant"},{v:"new",l:"New tenant"}]}/>
          <Inp label="Move-in date" type="date" value={tForm.moveIn} onChange={v=>setTF({...tForm,moveIn:v})}/>
          <Inp label="Contract end" type="date" value={tForm.contractEnd} onChange={v=>setTF({...tForm,contractEnd:v})}/>
          {tForm.status==="moved_out"&&<Inp label="Move-out date" type="date" value={tForm.moveOutDate} onChange={v=>setTF({...tForm,moveOutDate:v})}/>}
          <Inp label="Room rent (₱)" type="number" value={tForm.rent} onChange={v=>setTF({...tForm,rent:v})} placeholder="2000"/>
          <Inp label="Water (₱)" type="number" value={tForm.water} onChange={v=>setTF({...tForm,water:v})} placeholder="125"/>
          <Inp label="Wifi (₱)" type="number" value={tForm.wifi} onChange={v=>setTF({...tForm,wifi:v})} placeholder="200"/>
          <Inp label="Deposit (₱)" type="number" value={tForm.deposit} onChange={v=>setTF({...tForm,deposit:v})} placeholder="0"/>
          <Sel label="Deposit status" value={tForm.depStatus} onChange={v=>setTF({...tForm,depStatus:v})} options={["held","used","partial","returned"]}/>
          <Sel label="Status" value={tForm.status} onChange={v=>setTF({...tForm,status:v})} options={[{v:"occupied",l:"Occupied"},{v:"new",l:"New/Move-in"},{v:"vacant",l:"Vacant"},{v:"moved_out",l:"Moved out"}]}/>
        </div>
        <div style={{gridColumn:"span 2",marginTop:4}}><label style={s.label}>Private notes</label><input value={tForm.notes||""} onChange={e=>setTF({...tForm,notes:e.target.value})} placeholder="Notes about this tenant (private)..." style={s.input}/></div>
        <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:T.text3,margin:"12px 0 6px"}}>MOVE-IN CHECKLIST</div>
        {MIC_ITEMS.map((item,i)=>(
          <label key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",cursor:"pointer",borderBottom:`1px solid ${T.border}`,fontSize:13,color:T.text2}}>
            <input type="checkbox" checked={!!tMic[i]} onChange={e=>setTMic({...tMic,[i]:e.target.checked})} style={{accentColor:T.green,width:16,height:16,cursor:"pointer",flexShrink:0}}/> {item}
          </label>
        ))}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button style={s.btn(T.bg3,T.text)} onClick={()=>setTenantModal(false)}>Cancel</button>
          <button style={s.btn(T.green,"#071a0e")} onClick={saveTenant}>Save tenant</button>
        </div>
      </Modal>

      {/* Bill Modal */}
      <Modal open={billModal} onClose={()=>setBillModal(false)} title="Add / Update Bill">
        <div style={s.g2}>
          <Sel label="Room" value={String(bForm.room)} onChange={v=>{ const t=tenants.find(x=>x.room===parseInt(v)); const k=kwhData["r"+v]||{}; const prev=[...bills].filter(b=>b.room===parseInt(v)&&b.month<cm).sort((a,z)=>z.month.localeCompare(a.month))[0]; const pb=prev?.status!=="paid"&&prev?.balances?prev.balances.map(bl=>({desc:"Carry: "+bl.desc,amt:bl.amt})):[];setBalances(pb);setBF({...bForm,room:parseInt(v),rent:t?.rent||"",elec:k.bill?k.bill.toFixed(2):"",water:t?.water||"",wifi:t?.wifi||""});}} options={[{v:"",l:"Select..."},...tenants.map(t=>({v:String(t.room),l:`Room ${t.room} – ${t.name}`}))]}/>
          <Inp label="Date paid" type="date" value={bForm.datePaid} onChange={v=>setBF({...bForm,datePaid:v})}/>
          <Inp label="Room rent (₱)" type="number" value={bForm.rent} onChange={v=>setBF({...bForm,rent:v})}/>
          <Inp label="Electric (₱)" type="number" value={bForm.elec} onChange={v=>setBF({...bForm,elec:v})}/>
          <Inp label="Water (₱)" type="number" value={bForm.water} onChange={v=>setBF({...bForm,water:v})}/>
          <Inp label="Wifi (₱)" type="number" value={bForm.wifi} onChange={v=>setBF({...bForm,wifi:v})}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,marginBottom:6}}>
          <span style={{fontSize:13,fontWeight:700,color:T.text}}>Balances</span>
          <button style={s.btnSm(T.bg3,T.text)} onClick={()=>setBalances([...balances,{desc:"",amt:""}])}>+ Add balance</button>
        </div>
        {balances.map((bl,i)=>(
          <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
            <input placeholder="Description" value={bl.desc} onChange={e=>setBalances(balances.map((b,j)=>j===i?{...b,desc:e.target.value}:b))} style={{...s.input,flex:2}}/>
            <input type="number" placeholder="₱" value={bl.amt} onChange={e=>setBalances(balances.map((b,j)=>j===i?{...b,amt:e.target.value}:b))} style={{...s.input,width:85}}/>
            <button onClick={()=>setBalances(balances.filter((_,j)=>j!==i))} style={{background:T.rbg,color:T.red,border:`1px solid ${T.rbr}`,borderRadius:6,padding:"6px 10px",cursor:"pointer",fontWeight:700}}>×</button>
          </div>
        ))}
        <div style={s.g2}>
          <div><label style={s.label}>Total</label><input value={billTotal(bForm,balances)} readOnly style={{...s.input,fontWeight:800,fontSize:15,color:T.green,background:T.bg4}}/></div>
          <Inp label="Amount paid (₱)" type="number" value={bForm.amtPaid} onChange={v=>setBF({...bForm,amtPaid:v})} placeholder="0"/>
          <Sel label="Status" value={bForm.status} onChange={v=>setBF({...bForm,status:v})} options={["paid","balance","unpaid"]}/>
          <Sel label="Payment method" value={bForm.method} onChange={v=>setBF({...bForm,method:v})} options={METHODS}/>
        </div>
        <Inp label="Notes (private)" value={bForm.notes} onChange={v=>setBF({...bForm,notes:v})} placeholder="For your reference only"/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button style={s.btn(T.bg3,T.text)} onClick={()=>setBillModal(false)}>Cancel</button>
          <button style={s.btn(T.green,"#071a0e")} onClick={saveBill}>Save bill</button>
        </div>
      </Modal>

      {/* Expense Modal */}
      <Modal open={expModal} onClose={()=>setExpModal(false)} title="Add Expense">
        <Inp label="Description" value={eForm.desc} onChange={v=>setEF({...eForm,desc:v})} placeholder="e.g. Repairs, Electric..."/>
        <div style={s.g2}>
          <Inp label="Amount (₱)" type="number" value={eForm.amt} onChange={v=>setEF({...eForm,amt:v})}/>
          <Inp label="Date" type="date" value={eForm.date} onChange={v=>setEF({...eForm,date:v})}/>
          <Sel label="Category" value={eForm.cat} onChange={v=>setEF({...eForm,cat:v})} options={["Electric","Water","Wifi","Repairs","Other"]}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button style={s.btn(T.bg3,T.text)} onClick={()=>setExpModal(false)}>Cancel</button>
          <button style={s.btn(T.red,"#fff")} onClick={()=>{ if(!eForm.desc.trim()||!eForm.amt){alert("Enter description and amount");return;} saveExpenses([...expenses,{...eForm,amt:parseFloat(eForm.amt)}]); setExpModal(false); }}>Add expense</button>
        </div>
      </Modal>

      {/* ── TOP BAR ── */}
      <div style={s.topbar}>
        <div>
          <div style={{fontSize:16,fontWeight:700}}>🏠 Boarding House</div>
          <div style={{fontSize:11,color:T.text3,marginTop:2}}>{today.toLocaleDateString("en-PH",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:T.text3,textTransform:"uppercase",letterSpacing:.5}}>Due this month</div>
            <div style={{fontSize:13,fontWeight:700,color:T.amber}}>{due}</div>
          </div>
          <button onClick={()=>setBackupModal(true)} style={{...s.btnSm(T.bg3,T.text2),padding:"6px 8px",border:`1px solid ${T.border}`}} title="Backup & Restore">💾</button>
          <button onClick={()=>setReadmeOpen(true)} style={{...s.btnSm(T.bg3,T.text2),padding:"6px 8px",border:`1px solid ${T.border}`}} title="Help">📘</button>
          <button onClick={()=>{ const d=!darkMode; setDarkMode(d); LS.set("darkMode",d); }} style={{...s.btnSm(T.bg3,T.text2),padding:"6px 8px",border:`1px solid ${T.border}`}}>{darkMode?"☀️":"🌙"}</button>
        </div>
      </div>

      {/* ── NAV ── */}
      <div style={s.nav}>
        {TABS.map((t,i)=>(
          <button key={t} style={s.navBtn(tab===i)} onClick={()=>setTab(i)}>
            {t}
            {i===0&&overdueList.length>0&&<span style={{position:"absolute",top:6,right:2,background:T.red,color:"#fff",borderRadius:99,fontSize:9,fontWeight:700,padding:"1px 4px",minWidth:14,textAlign:"center"}}>{overdueList.length}</span>}
          </button>
        ))}
      </div>

      <div style={s.content}>

        {/* ── DASHBOARD ── */}
        {tab===0&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[[T.green,"Active tenants",tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").length],[T.green,"Paid",paid.length],[T.red,"Unpaid",unpaid.length],[T.blue,"Total billed",peso(curBills.reduce((a,b)=>a+b.total,0))]].map(([c,l,v])=>(
                <div key={l} style={s.stat(c)}><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:T.text3}}>{l}</div><div style={{fontSize:20,fontWeight:800,color:c,marginTop:3}}>{v}</div></div>
              ))}
            </div>
            {overdueList.length>0&&<div style={{background:T.rbg,border:`1px solid ${T.rbr}`,borderRadius:8,padding:"9px 12px",fontSize:12,fontWeight:600,color:T.red,marginBottom:10}}>⚠️ OVERDUE: {overdueList.map(b=>`Room ${b.room} (${b.name})`).join(", ")}</div>}
            {curBills.length===0&&tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").length>0&&(
              <div style={{background:T.gbg,border:`1px solid ${T.gbr}`,borderRadius:10,padding:12,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:700,color:T.green,fontSize:13}}>No bills yet this month</div><div style={{fontSize:12,color:T.text3,marginTop:2}}>Auto-create for all active tenants</div></div>
                <button style={s.btn(T.green,"#071a0e")} onClick={()=>genBills()}>Generate bills</button>
              </div>
            )}
            <div style={{...s.sectionLabel}}>✅ PAID THIS MONTH</div>
            {paid.length===0&&<div style={{color:T.text3,fontSize:13,padding:"6px 0"}}>None paid yet.</div>}
            {paid.map(b=>(
              <div key={b.room} style={{background:T.gbg,border:`1px solid ${T.gbr}`,borderRadius:10,padding:11,marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{b.name} <span style={{color:T.text3,fontWeight:400,fontSize:12}}>— Room {b.room}</span></div>
                  <div style={{fontSize:12,color:T.text3,marginTop:2}}>{b.datePaid||"—"} · <span style={{background:T.bbg,color:T.blue,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{b.method||"—"}</span></div>
                </div>
                <div style={{textAlign:"right"}}><div style={{fontSize:17,fontWeight:800,color:T.green}}>{peso(b.total)}</div><span style={s.badge(T.green,"#071a0e")}>PAID</span></div>
              </div>
            ))}
            <div style={s.sectionLabel}>❌ UNPAID / BALANCE</div>
            {unpaid.length===0&&<div style={{color:T.text3,fontSize:13,padding:"6px 0"}}>All paid this month! 🎉</div>}
            {unpaid.map(b=>{const ov=todayStr()>due;return(
              <div key={b.room} style={{background:ov?T.rbg:T.abg,border:`1px solid ${ov?T.rbr:T.abr}`,borderRadius:10,padding:11,marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{b.name} <span style={{color:T.text3,fontWeight:400,fontSize:12}}>— Room {b.room}</span></div>
                  <div style={{fontSize:12,color:T.text3,marginTop:2}}>Due {due}{ov&&<span style={{color:T.red,fontWeight:700}}> · OVERDUE</span>}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  <div style={{fontSize:17,fontWeight:800}}>{peso(b.total)}</div>
                  <span style={s.badge(b.status==="balance"?T.abg:T.rbg,b.status==="balance"?T.amber:T.red)}>{b.status}</span>
                  <button style={{padding:"3px 8px",fontSize:11,fontWeight:700,background:T.bbg,color:T.blue,border:`1px solid ${T.bbr}`,borderRadius:6,cursor:"pointer"}} onClick={()=>copySMS(b.room)}>SMS</button>
                </div>
              </div>
            );})}
            <div style={s.sectionLabel}>🏦 TRANSFER CHECKLIST</div>
            {curBills.length===0&&<div style={{color:T.text3,fontSize:13}}>No bills yet.</div>}
            {curBills.map(b=>{const tkey=`${b.room}-${b.month}`;const tr=transfers[tkey]||{};const all=tr.room&&tr.elec&&tr.water&&tr.wifi;const ip=b.status==="paid";return(
              <div key={b.room} style={{padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:700}}>Room {b.room} — {b.name}</span>
                  <span style={s.badge(all?T.green:T.bg4,all?"#071a0e":T.text2)}>{all?"All done":"Pending"}</span>
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {["room","elec","water","wifi"].map(f=>(
                    <label key={f} style={{display:"flex",gap:4,alignItems:"center",fontSize:12,cursor:"pointer",color:tr[f]?T.green:T.text2}}>
                      <input type="checkbox" checked={!!tr[f]} onChange={()=>togTr(tkey,f)} style={{accentColor:T.green,width:14,height:14,cursor:"pointer"}}/> {f}
                    </label>
                  ))}
                </div>
              </div>
            );})}
          </div>
        )}

        {/* ── TENANTS ── */}
        {tab===1&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>Tenants</h2>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button style={s.btn(T.amber,"#1c0f00")} onClick={()=>{setPBF({room:"",month:"",datePaid:"",rent:"",elec:"",water:"",wifi:"",status:"paid",method:"gcash",notes:""});setPrevBillBals([]);setPrevBillModal(true);}}>+ Past bill</button>
                <button style={s.btn(T.green,"#071a0e")} onClick={()=>openTenantModal()}>+ Add tenant</button>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by name or room..." style={{...s.input,maxWidth:300}}/>
            </div>
            <div style={{fontSize:12,color:T.text3,marginBottom:8}}>{filteredTenants.length} of {tenants.length} tenants</div>
            {filteredTenants.length===0&&<div style={{color:T.text3,padding:30,textAlign:"center"}}>No tenants found.</div>}
            {/* Active tenants */}
            {filteredTenants.filter(t=>t.status!=="moved_out").length>0&&<>
              <div style={{fontSize:12,fontWeight:700,color:T.green,marginBottom:8,marginTop:4}}>ACTIVE TENANTS ({filteredTenants.filter(t=>t.status!=="moved_out").length})</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginBottom:16}}>
              {filteredTenants.filter(t=>t.status!=="moved_out").map((t,i)=>{
                const origIdx=tenants.findIndex(x=>x.room===t.room);
                const b=bills.find(x=>x.room===t.room&&x.month===cm);
                const ip=b?.status==="paid";const ov=b&&b.status!=="paid"&&todayStr()>due;
                const mo=t.moveIn?Math.max(0,Math.floor(diffDays(t.moveIn,todayStr())/30)):0;
                const chk=mic["m"+t.room]||{};const cd=MIC_ITEMS.filter((_,j)=>chk[j]).length;
                const rel=getReliability(bills.filter(x=>x.room===t.room));
                return <div key={t.room} style={{background:ip?`${T.green}10`:T.card,border:`1px solid ${ip?T.gbr:T.border}`,borderLeft:`3px solid ${ip?T.green:ov?T.red:t.type==="new"?T.blue:T.border2}`,borderRadius:10,padding:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{fontSize:24,fontWeight:800,color:T.green}}>Rm {t.room}</div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                      <span style={s.badge(t.type==="new"?T.bbg:T.bg4,t.type==="new"?T.blue:T.text2)}>{t.type==="new"?"New":"Old"}</span>
                      {ov&&<span style={s.badge(T.rbg,T.red)}>Overdue</span>}
                    </div>
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>{t.status!=="vacant"?t.name:"— Vacant —"}</div>
                  {t.phone&&<div style={{fontSize:12,color:T.text3,marginTop:2}}>{t.phone}</div>}
                  {t.moveIn&&<div style={{fontSize:12,color:T.text3,marginTop:4}}>Move-in: {t.moveIn}{mo>0?` · ${mo}mo`:""}</div>}
                  {t.contractEnd&&<div style={{fontSize:12,color:todayStr()>t.contractEnd?T.red:T.text3,marginTop:2}}>Contract: {t.contractEnd}</div>}
                  <div style={{marginTop:6,fontSize:12,fontWeight:600,color:rel.color}}>● {rel.label} ({rel.score}%)</div>
                  <div style={{marginTop:8,padding:"7px 9px",background:ip?T.gbg:T.abg,border:`1px solid ${ip?T.gbr:T.abr}`,borderRadius:7,fontSize:12,fontWeight:600,color:ip?T.green:T.amber}}>Due: {due}{b?` · ${b.status.toUpperCase()}`:" · No bill"}</div>
                  {b&&<div style={{marginTop:7,fontSize:15,fontWeight:800,color:ip?T.green:T.text}}>Total: {peso(b.total)}</div>}
                  {t.notes&&<div style={{marginTop:5,fontSize:11,color:T.amber,fontStyle:"italic"}}>📝 {t.notes}</div>}
                  {t.type==="new"&&cd<MIC_ITEMS.length&&<div style={{marginTop:5}}><div style={{fontSize:12,color:T.blue}}>{cd}/{MIC_ITEMS.length} move-in items</div><div style={{height:4,background:T.bg4,borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.round(cd/MIC_ITEMS.length*100)}%`,background:T.blue,borderRadius:2}}/></div></div>}
                  <div style={{display:"flex",gap:5,marginTop:10,flexWrap:"wrap"}}>
                    <button style={s.btnSm(T.green,"#071a0e")} onClick={()=>setProfileTenant(t)}>👤 Profile</button>
                    <button style={s.btnSm(T.bg3,T.text)} onClick={()=>openTenantModal(origIdx)}>Edit</button>
                    <button style={{padding:"4px 9px",fontSize:11,fontWeight:700,background:T.bbg,color:T.blue,border:`1px solid ${T.bbr}`,borderRadius:6,cursor:"pointer"}} onClick={()=>copySMS(t.room)}>SMS</button>
                    <button style={s.btnSm(T.rbg,T.red)} onClick={()=>{if(!confirm("Remove?"))return;saveTenants(tenants.filter((_,j)=>j!==origIdx));}}>Remove</button>
                  </div>
                </div>;
              })}
              </div>
            </>}
            {/* Former tenants */}
            {filteredTenants.filter(t=>t.status==="moved_out").length>0&&<>
              <div style={{fontSize:12,fontWeight:700,color:T.text3,marginBottom:8,marginTop:4,display:"flex",alignItems:"center",gap:8}}>
                <span>FORMER TENANTS ({filteredTenants.filter(t=>t.status==="moved_out").length})</span>
                <span style={{fontSize:11,fontWeight:400}}>— Records kept for reference</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
              {filteredTenants.filter(t=>t.status==="moved_out").map((t)=>{
                const origIdx=tenants.findIndex(x=>x.room===t.room);
                const roomBills=bills.filter(b=>b.room===t.room);
                const totalPaid=roomBills.filter(b=>b.status==="paid").reduce((a,b)=>a+b.total,0);
                const rel=getReliability(roomBills);
                return <div key={t.room} style={{background:T.bg3,border:`1px solid ${T.border}`,borderRadius:10,padding:12,opacity:.8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{fontSize:22,fontWeight:800,color:T.text3}}>Rm {t.room}</div>
                    <span style={{...s.badge(T.bg4,T.text3),fontSize:11}}>Moved out</span>
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:T.text2}}>{t.name}</div>
                  {t.phone&&<div style={{fontSize:12,color:T.text3,marginTop:2}}>{t.phone}</div>}
                  {t.moveIn&&<div style={{fontSize:12,color:T.text3,marginTop:3}}>Moved in: {t.moveIn}</div>}
                  {t.moveOutDate&&<div style={{fontSize:12,color:T.text3,marginTop:1}}>Moved out: {t.moveOutDate}</div>}
                  <div style={{marginTop:8,padding:"6px 9px",background:T.bg4,borderRadius:7,fontSize:12}}>
                    <div style={{color:T.text2,fontWeight:600}}>Total paid: <span style={{color:T.green}}>{peso(totalPaid)}</span></div>
                    <div style={{color:rel.color,fontSize:11,marginTop:2}}>{rel.label}</div>
                  </div>
                  {t.notes&&<div style={{marginTop:5,fontSize:11,color:T.amber,fontStyle:"italic"}}>📝 {t.notes}</div>}
                  <div style={{display:"flex",gap:5,marginTop:10,flexWrap:"wrap"}}>
                    <button style={s.btnSm(T.bg4,T.text2)} onClick={()=>setProfileTenant(t)}>👤 History</button>
                    <button style={s.btnSm(T.bg4,T.text2)} onClick={()=>openTenantModal(origIdx)}>Edit</button>
                    <button style={s.btnSm(T.green,"#071a0e")} onClick={()=>{if(!confirm("Mark as active renter again?"))return;saveTenants(tenants.map((x,i)=>i===origIdx?{...x,status:"occupied",moveOutDate:""}:x));}}>↩ Re-activate</button>
                    <button style={s.btnSm(T.rbg,T.red)} onClick={()=>{if(!confirm("Permanently delete this tenant and all their records? This cannot be undone."))return;saveTenants(tenants.filter((_,j)=>j!==origIdx));}}>Delete</button>
                  </div>
                </div>;
              })}
              </div>
            </>}
          </div>
        )}

        {/* ── BILLING ── */}
        {tab===2&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>Billing</h2>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button style={s.btnSm(T.green,"#071a0e")} onClick={()=>genBills()}>Auto-generate</button>
                <button style={s.btnSm(T.bg3,T.text)} onClick={()=>openBillModal()}>+ Add bill</button>
                <button style={s.btnSm(T.amber,"#1c0f00")} onClick={()=>{setPBF({room:"",month:"",datePaid:"",rent:"",elec:"",water:"",wifi:"",status:"paid",method:"gcash",notes:""});setPrevBillBals([]);setPrevBillModal(true);}}>+ Past bill</button>
                <button style={s.btnSm(T.blue,"#fff")} onClick={printAllInvoices}>🖨 Print all</button>
                <button style={s.btnSm(T.amber,"#1c0f00")} onClick={()=>{
                  exportCSV([["BOARDING HOUSE — Billing Record"],["Month: "+fmtMonth(activeBillingMonth)],["Generated: "+todayStr()],[],["Room","Name","Type","Due Date","Date Paid","Room Rent","Electric","Water","Wifi","Balance","Total","Status","Method"],...billingCur.map(b=>{const t=tenants.find(x=>x.room===b.room);return[b.room,b.name,t?.type||"",billingDue,b.datePaid||"",b.rent,b.elec,b.water,b.wifi,b.balTotal||0,b.total,b.status,b.method||""];}),[""],["TOTALS","","","","",billingCur.reduce((a,b)=>a+b.rent,0),billingCur.reduce((a,b)=>a+b.elec,0),billingCur.reduce((a,b)=>a+b.water,0),billingCur.reduce((a,b)=>a+b.wifi,0),billingCur.reduce((a,b)=>a+(b.balTotal||0),0),billingCur.reduce((a,b)=>a+b.total,0)]],`Billing_${activeBillingMonth}.csv`);
                }}>Export CSV</button>
              </div>
            </div>
            <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:10,paddingBottom:2}}>
              {allBillingMonths.map(m=>(
                <button key={m} onClick={()=>setActiveBillingMonth(m)} style={{padding:"5px 12px",fontSize:12,fontWeight:600,border:`1px solid ${m===activeBillingMonth?T.green:T.border2}`,background:m===activeBillingMonth?T.green:T.bg2,borderRadius:99,cursor:"pointer",whiteSpace:"nowrap",color:m===activeBillingMonth?"#071a0e":T.text3}}>{fmtMonth(m)}</button>
              ))}
            </div>
            <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:820}}>
              <thead><tr>{["Room","Name","Type","Due","Paid on","Balances","Room","Elec","Water","Wifi","Total","Status","Transfer",""].map(h=><th key={h} style={s.thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {billingCur.length===0&&<tr><td colSpan={14} style={{...s.tdStyle,padding:30,textAlign:"center",color:T.text3}}>No bills for {fmtMonth(activeBillingMonth)}.</td></tr>}
                {billingCur.map(b=>{
                  const ip=b.status==="paid",ib=b.status==="balance",ov=b.status!=="paid"&&todayStr()>billingDue;
                  const tkey=`${b.room}-${b.month}`;const tr2=transfers[tkey]||{};
                  const t=tenants.find(x=>x.room===b.room);
                  return <tr key={b.room} style={{background:ip?`${T.green}08`:ib?`${T.amber}08`:ov?`${T.red}08`:"transparent"}}>
                    <td style={s.tdStyle}><strong style={{color:T.green}}>Rm {b.room}</strong></td>
                    <td style={{...s.tdStyle,fontWeight:600}}>{b.name}</td>
                    <td style={s.tdStyle}><span style={s.badge(t?.type==="new"?T.bbg:T.bg4,t?.type==="new"?T.blue:T.text2)}>{t?.type||"old"}</span></td>
                    <td style={{...s.tdStyle,fontSize:11,color:ov?T.red:T.text2}}>{billingDue}</td>
                    <td style={{...s.tdStyle,fontSize:11,color:T.text3}}>{b.datePaid||"—"}</td>
                    <td style={s.tdStyle}>
                      {b.balances?.length?b.balances.map((bl,i)=><div key={i} style={{color:T.amber,fontSize:11}}>{bl.desc}: <b>{peso(bl.amt)}</b></div>):<span style={{color:T.text3}}>—</span>}
                      <button onClick={()=>qBal(b.room,b.month)} style={{fontSize:10,background:T.abg,color:T.amber,border:`1px solid ${T.abr}`,borderRadius:4,padding:"2px 6px",cursor:"pointer",marginTop:2,display:"block"}}>+bal</button>
                    </td>
                    {["rent","elec","water","wifi"].map(f=><td key={f} style={{...s.tdStyle,fontSize:12,color:T.text2}}>{peso(b[f])}</td>)}
                    <td style={{...s.tdStyle,fontWeight:800,color:ip?T.green:T.text}}>{peso(b.total)}</td>
                    <td style={s.tdStyle}>
                      <span style={s.badge(ip?T.green:ib?T.abg:T.rbg,ip?"#071a0e":ib?T.amber:T.red)}>{b.status}</span>
                      {b.method&&<div style={{marginTop:3}}><span style={{...s.badge(T.bg4,T.text2),fontSize:10}}>{b.method}</span></div>}
                      <div style={{display:"flex",gap:3,marginTop:5}}>
                        <button style={s.btnSm(T.bg3,T.text)} onClick={()=>openBillModal(b.room,b.month)}>Edit</button>
                        <button style={s.btnSm(T.rbg,T.red)} onClick={()=>{if(!confirm("Delete?"))return;saveBills(bills.filter(x=>!(x.room===b.room&&x.month===b.month)));}}>Del</button>
                      </div>
                    </td>
                    <td style={s.tdStyle}>
                      {["room","elec","water","wifi"].map(f=>(
                        <label key={f} style={{display:"flex",gap:4,alignItems:"center",fontSize:11,cursor:"pointer",color:tr2[f]?T.green:T.text2,marginBottom:2}}>
                          <input type="checkbox" checked={!!tr2[f]} onChange={()=>togTr(tkey,f)} style={{accentColor:T.green,cursor:"pointer"}}/> {f}
                        </label>
                      ))}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table></div>
          </div>
        )}

        {/* ── KWH ── */}
        {tab===3&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>KWH Reader — {today.toLocaleDateString("en-PH",{month:"long",year:"numeric"})}</h2>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:600,color:T.text2}}>Rate ₱/kwh</span>
                <input type="number" value={kwhRate} onChange={e=>setKwhRate(parseFloat(e.target.value)||15)} style={{...s.input,width:65,textAlign:"center"}}/>
              </div>
            </div>
            <div style={{background:T.gbg,border:`1px solid ${T.gbr}`,borderRadius:8,padding:"9px 12px",fontSize:12,color:T.green,marginBottom:12}}>(Current − Previous) × Rate = Electric bill. Click Apply → current auto-becomes next month's previous.</div>
            <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:660}}>
              <thead><tr>{["Room","Name","Previous","Current","KWH Used","Rate","Electric Bill","Last 3 months",""].map(h=><th key={h} style={s.thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").length===0&&<tr><td colSpan={9} style={{...s.tdStyle,padding:30,textAlign:"center",color:T.text3}}>Add tenants first.</td></tr>}
                {tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").map(t=>{
                  const k=kwhData["r"+t.room]||{};const prev=k.pfm?.[cm]??k.prev??0;const curr=k.curr||0;
                  const kused=Math.max(0,curr-prev);const hist=(k.hist||[]).slice(-3).reverse();
                  return <tr key={t.room}>
                    <td style={s.tdStyle}><strong style={{color:T.green}}>Rm {t.room}</strong></td>
                    <td style={{...s.tdStyle,fontWeight:600}}>{t.name}</td>
                    <td style={s.tdStyle}><input type="number" defaultValue={prev||""} key={`prev-${t.room}-${cm}`} placeholder="Prev" onBlur={e=>updKWH(t.room,"prev",e.target.value)} style={{...s.input,width:80,textAlign:"center"}}/></td>
                    <td style={s.tdStyle}><input type="number" defaultValue={curr||""} key={`curr-${t.room}-${cm}`} placeholder="Curr" onBlur={e=>updKWH(t.room,"curr",e.target.value)} style={{...s.input,width:80,textAlign:"center"}}/></td>
                    <td style={{...s.tdStyle,fontWeight:800,color:T.blue}}>{kused}</td>
                    <td style={{...s.tdStyle,color:T.text3}}>₱{kwhRate}</td>
                    <td style={{...s.tdStyle,fontWeight:800,color:T.green}}>{peso(kused*kwhRate)}</td>
                    <td style={{...s.tdStyle,fontSize:11,color:T.text3,lineHeight:1.6}}>{hist.map(h=>`${MS[parseInt(h.month.split("-")[1])-1]}: ${h.kwh}kwh`).join("\n")||"—"}</td>
                    <td style={s.tdStyle}><button style={s.btnSm(T.green,"#071a0e")} onClick={()=>applyKWH(t.room)}>Apply</button></td>
                  </tr>;
                })}
              </tbody>
            </table></div>
          </div>
        )}

        {/* ── INVOICE ── */}
        {tab===4&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>Invoice</h2>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <select value={invRoom} onChange={e=>setInvRoom(e.target.value)} style={{...s.select,width:160}}><option value="">Select room...</option>{tenants.map(t=><option key={t.room} value={t.room}>Room {t.room} – {t.name}</option>)}</select>
                <button style={s.btnSm(T.bg3,T.text)} onClick={()=>copySMS(parseInt(invRoom)||0)}>Copy SMS</button>
                <button style={s.btnSm(T.blue,"#fff")} onClick={printAllInvoices}>🖨 Print all</button>
                <button style={s.btnSm(T.bg3,T.text)} onClick={()=>window.print()}>Print this</button>
              </div>
            </div>
            {!invRoom?<div style={{color:T.text3,padding:40,textAlign:"center"}}>Select a room to generate invoice.</div>:
            <div style={{background:darkMode?"#1a1d27":"#fff",border:`1px solid ${T.border}`,borderRadius:12,padding:18,maxWidth:400,margin:"0 auto",color:darkMode?T.text:"#222"}}>
              <div style={{textAlign:"center",borderBottom:`2px solid ${T.green}`,paddingBottom:10,marginBottom:12}}>
                <div style={{fontSize:20,fontWeight:800,color:T.green}}>BOARDING HOUSE</div>
                <div style={{fontSize:14,fontWeight:700,marginTop:3}}>{mLabel}</div>
                <div style={{fontSize:11,color:T.text3,marginTop:1}}>{dLabel}</div>
              </div>
              <div style={{background:T.bg3,borderRadius:8,padding:"9px 11px",marginBottom:12}}>
                <div style={{fontSize:15,fontWeight:700}}>Room {invRoom} — {invTenant?.name||"—"}</div>
                {invTenant?.phone&&<div style={{fontSize:11,color:T.text3,marginTop:1}}>{invTenant.phone}</div>}
              </div>
              {[{title:"Electricity",rows:[["Rate",`₱${kwhRate}/kwh`],["Previous",invK.prev||0],["Current",invK.curr||0],["KWH used",`${invK.kwh||0} kwh`],["Electric bill",peso(invElec),true]]},{title:"Charges",rows:[["Water",peso(invWater)],["Room rent",peso(invRent)],["Wifi",peso(invWifi)]]},...(invBals.length?[{title:"Balances",rows:invBals.map(bl=>[bl.desc,peso(bl.amt),false,T.amber])}]:[])].map(sec=>(
                <div key={sec.title}>
                  <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:.7,color:T.text3,marginBottom:5,marginTop:10}}>{sec.title}</div>
                  {sec.rows.map(([l,v,hi,col])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}`,fontSize:13}}><span style={{color:T.text2}}>{l}</span><span style={{fontWeight:hi?700:400,color:hi?T.green:col||T.text}}>{v}</span></div>)}
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 3px",fontSize:16,fontWeight:800,borderTop:`2px solid ${T.border}`,marginTop:8,color:T.green}}><span>Total due</span><span>{peso(invTotal)}</span></div>
              <div style={{textAlign:"center",marginTop:10,fontSize:12,fontWeight:600,color:T.amber}}>Due on or before {invDueLabel}</div>
            </div>}
          </div>
        )}

        {/* ── ROOMS ── */}
        {tab===5&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>Rooms</h2>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,color:T.text3}}>{tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").length} occupied · {tenants.filter(t=>t.status==="vacant").length} vacant · {tenants.filter(t=>t.status==="moved_out").length} former</div>
                <div style={{fontSize:12,color:T.green,fontWeight:700}}>Occupancy: {tenants.length?Math.round((tenants.filter(t=>t.status!=="vacant"&&t.status!=="moved_out").length/tenants.length)*100):0}%</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:10}}>
              {tenants.map(t=>{
                const b=bills.find(x=>x.room===t.room&&x.month===cm);const ip=b?.status==="paid";const ov=b&&b.status!=="paid"&&todayStr()>due;
                const vacDays=t.status==="vacant"&&t.vacantSince?diffDays(t.vacantSince,todayStr()):0;
                return <div key={t.room} style={{background:ip?`${T.green}08`:T.card,border:`1px solid ${ip?T.gbr:T.border}`,borderRadius:10,padding:12,cursor:"pointer"}} onClick={()=>setProfileTenant(t)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:24,fontWeight:800,color:T.green}}>Rm {t.room}</div>
                    <span style={s.badge(t.type==="new"?T.bbg:T.bg4,t.type==="new"?T.blue:T.text2)}>{t.type||"old"}</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,marginTop:4,color:T.text}}>{t.status!=="vacant"?t.name:"Vacant"}</div>
                  {t.status==="vacant"&&vacDays>0&&<div style={{fontSize:11,color:T.amber,marginTop:2}}>Vacant {vacDays} days</div>}
                  {b?<div style={{marginTop:7}}><span style={s.badge(ip?T.green:b.status==="balance"?T.abg:T.rbg,ip?"#071a0e":b.status==="balance"?T.amber:T.red)}>{b.status}</span> <span style={{fontSize:13,fontWeight:700,color:ip?T.green:T.text}}>{peso(b.total)}</span></div>:<div style={{fontSize:12,color:T.text3,marginTop:7}}>No bill this month</div>}
                  {ov&&<div style={{fontSize:12,fontWeight:700,color:T.red,marginTop:3}}>OVERDUE</div>}
                  <div style={{fontSize:11,color:T.text3,marginTop:5}}>Tap to view profile</div>
                </div>;
              })}
            </div>
          </div>
        )}

        {/* ── FINANCE ── */}
        {tab===6&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>Finance</h2>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <select value={finMonth} onChange={e=>setFinMonth(e.target.value)} style={{...s.select,width:140}}>
                  {[...new Set([cm,...bills.map(b=>b.month)])].sort((a,z)=>z.localeCompare(a)).map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
                </select>
                <button style={s.btnSm(T.amber,"#1c0f00")} onClick={()=>{
                  const rows=[["BOARDING HOUSE — Financial Report"],["Year: "+selYear],["Generated: "+todayStr()],[],["Month","Room Rent","Electric","Water","Wifi","Gross","Expenses","Net"],...yearMonths.map(ym=>{const mb=bills.filter(b=>b.month===ym);const r=mb.reduce((a,b)=>a+b.rent,0),e=mb.reduce((a,b)=>a+b.elec,0),w=mb.reduce((a,b)=>a+b.water,0),wf=mb.reduce((a,b)=>a+b.wifi,0),g=mb.reduce((a,b)=>a+b.total,0),ex=expenses.filter(x=>x.date?.slice(0,7)===ym).reduce((a,x)=>a+x.amt,0);return[fmtMonth(ym),r,e,w,wf,g,ex,g-ex];}),[""],["EXPENSES"],[],["Date","Description","Category","Amount"],...expenses.sort((a,z)=>(a.date||"").localeCompare(z.date||"")).map(e=>[e.date,e.desc,e.cat,e.amt])];
                  exportCSV(rows,`Finance_${selYear}.csv`);
                }}>Export CSV</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
              {[[T.green,"Gross income",peso(finGross)],[T.blue,"Net income",peso(finGross-finExp)],[T.red,"Total expenses",peso(finExp)],[T.amber,"Room rent (net profit)",peso(finBills.reduce((a,b)=>a+b.rent,0))]].map(([c,l,v])=>(
                <div key={l} style={s.stat(c)}><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:T.text3}}>{l}</div><div style={{fontSize:18,fontWeight:800,color:c,marginTop:3}}>{v}</div></div>
              ))}
            </div>
            <div style={{background:T.bg3,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,display:"flex",justifyContent:"space-between"}}>
              <span style={{color:T.text2}}>Collection rate this month</span>
              <span style={{fontWeight:800,color:collectionRate>=80?T.green:collectionRate>=50?T.amber:T.red}}>{collectionRate}%</span>
            </div>
            <div style={s.sectionLabel}>INCOME BREAKDOWN</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[["Room Rent",finBills.reduce((a,b)=>a+b.rent,0)],["Electric",finBills.reduce((a,b)=>a+b.elec,0)],["Water",finBills.reduce((a,b)=>a+b.water,0)],["Wifi",finBills.reduce((a,b)=>a+b.wifi,0)]].map(([l,v])=>(
                <div key={l} style={{background:T.bg3,border:`1px solid ${T.border}`,borderRadius:8,padding:10}}><div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",color:T.text3}}>{l}</div><div style={{fontSize:17,fontWeight:800,marginTop:3,color:T.text}}>{peso(v)}</div></div>
              ))}
            </div>
            <div style={s.sectionLabel}>YEARLY SUMMARY — <span style={{color:T.green}}>{selYear}</span></div>
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:T.bg3,fontSize:10,fontWeight:700,textTransform:"uppercase",color:T.text3}}>
                {["Month","Room","Elec","Water","Wifi","Gross","Exp","Net"].map(h=><span key={h}>{h}</span>)}
              </div>
              {yearMonths.map(ym=>{
                const mb=bills.filter(b=>b.month===ym);
                const r=mb.reduce((a,b)=>a+b.rent,0),e=mb.reduce((a,b)=>a+b.elec,0),w=mb.reduce((a,b)=>a+b.water,0),wf=mb.reduce((a,b)=>a+b.wifi,0),g=mb.reduce((a,b)=>a+b.total,0);
                const ex=expenses.filter(x=>x.date?.slice(0,7)===ym).reduce((a,x)=>a+x.amt,0);
                const nt=g-ex;const has=mb.length>0;
                return <div key={ym} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",borderBottom:`1px solid ${T.border}`,fontSize:12,background:ym===finMonth?`${T.green}10`:"transparent"}}>
                  <span style={{fontWeight:600,color:T.text2}}>{MS[parseInt(ym.split("-")[1])-1]}</span>
                  {[r,e,w,wf,g].map((v,i)=><span key={i} style={{color:has?T.text:T.border2}}>{has?peso(v):"—"}</span>)}
                  <span style={{color:ex>0?T.red:T.border2}}>{ex>0?peso(ex):"—"}</span>
                  <span style={{color:has?(nt>=0?T.green:T.red):T.border2}}>{has?peso(nt):"—"}</span>
                </div>;
              })}
              <div style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:T.bg3,fontSize:12,fontWeight:800}}>
                <span style={{color:T.text2}}>TOTAL {selYear}</span>
                {[yearMonths.reduce((s,ym)=>s+bills.filter(b=>b.month===ym).reduce((a,b)=>a+b.rent,0),0),yearMonths.reduce((s,ym)=>s+bills.filter(b=>b.month===ym).reduce((a,b)=>a+b.elec,0),0),yearMonths.reduce((s,ym)=>s+bills.filter(b=>b.month===ym).reduce((a,b)=>a+b.water,0),0),yearMonths.reduce((s,ym)=>s+bills.filter(b=>b.month===ym).reduce((a,b)=>a+b.wifi,0),0)].map((v,i)=><span key={i} style={{color:T.text}}>{peso(v)}</span>)}
                <span style={{color:T.green}}>{peso(yearMonths.reduce((s,ym)=>s+bills.filter(b=>b.month===ym).reduce((a,b)=>a+b.total,0),0))}</span>
                <span style={{color:T.red}}>{peso(yearMonths.reduce((s,ym)=>s+expenses.filter(x=>x.date?.slice(0,7)===ym).reduce((a,x)=>a+x.amt,0),0))}</span>
                <span style={{color:T.green}}>{peso(yearMonths.reduce((s,ym)=>s+bills.filter(b=>b.month===ym).reduce((a,b)=>a+b.total,0)-expenses.filter(x=>x.date?.slice(0,7)===ym).reduce((a,x)=>a+x.amt,0),0))}</span>
              </div>
            </div>
            <div style={s.divider}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={s.sectionLabel}>EXPENSES</div>
              <button style={s.btnSm(T.red,"#fff")} onClick={()=>{setEF({desc:"",amt:"",date:todayStr(),cat:"Electric"});setExpModal(true);}}>+ Add expense</button>
            </div>
            {expenses.length===0&&<div style={{color:T.text3,fontSize:13}}>No expenses yet.</div>}
            {[...expenses].sort((a,z)=>(z.date||"").localeCompare(a.date||"")).map((e,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                <div><div style={{fontWeight:600}}>{e.desc}</div><div style={{fontSize:12,color:T.text3,marginTop:1}}>{e.date} · {e.cat}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontWeight:800,color:T.red}}>{peso(e.amt)}</span><button style={s.btnSm(T.rbg,T.red)} onClick={()=>saveExpenses(expenses.filter((_,j)=>j!==i))}>Del</button></div>
              </div>
            ))}
            <div style={s.divider}/>
            <div style={s.sectionLabel}>DEPOSIT TRACKER</div>
            {tenants.filter(t=>t.deposit>0).length===0&&<div style={{color:T.text3,fontSize:13}}>No deposits.</div>}
            {tenants.filter(t=>t.deposit>0).map(t=>(
              <div key={t.room} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                <div><div style={{fontWeight:600}}>Room {t.room} — {t.name}</div><div style={{fontSize:12,color:T.text3}}>{peso(t.deposit)} deposit</div></div>
                <span style={s.badge(t.depStatus==="held"?T.gbg:t.depStatus==="used"?T.rbg:T.abg,t.depStatus==="held"?T.green:t.depStatus==="used"?T.red:T.amber)}>{t.depStatus||"held"}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab===7&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700}}>History</h2>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <select value={histRoom} onChange={e=>setHistRoom(e.target.value)} style={{...s.select,width:155}}><option value="">All rooms</option>{tenants.map(t=><option key={t.room} value={t.room}>Room {t.room} – {t.name}</option>)}</select>
                <select value={histYear} onChange={e=>setHistYear(e.target.value)} style={{...s.select,width:90}}>{allHistYears.map(y=><option key={y} value={y}>{y}</option>)}</select>
                <button style={s.btnSm(T.amber,"#1c0f00")} onClick={()=>{
                  const rows=[["BOARDING HOUSE — Payment History"],[`Year: ${histYear}${histRoom?` | Room ${histRoom}`:""}`],["Generated: "+todayStr()],[],["Month","Room","Name","Type","Due Date","Date Paid","Room Rent","Electric","Water","Wifi","Balance","Total","Status","Method"],...histFiltered.map(b=>{const t=tenants.find(x=>x.room===b.room);const[y,mo]=b.month.split("-").map(Number);return[fmtMonth(b.month),b.room,b.name,t?.type||"",lastDay(y,mo-1),b.datePaid||"",b.rent,b.elec,b.water,b.wifi,b.balTotal||0,b.total,b.status,b.method||""];})];
                  exportCSV(rows,`History_${histYear}${histRoom?"_Rm"+histRoom:""}.csv`);
                }}>Export CSV</button>
              </div>
            </div>
            {Object.keys(histByRoom).length===0&&<div style={{color:T.text3,padding:30,textAlign:"center"}}>No records found.</div>}
            {Object.entries(histByRoom).sort((a,z)=>a[0]-z[0]).map(([room,rb])=>{
              const t=tenants.find(x=>x.room==room);const tot=rb.reduce((a,b)=>a+b.total,0);
              const rel=getReliability(rb);
              return <div key={room} style={{...s.card,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <span style={{fontSize:16,fontWeight:800,color:T.green}}>Room {room}</span>
                    <span style={{fontSize:13,fontWeight:600,marginLeft:4}}> — {t?.name||"Ex-tenant"}</span>
                    <span style={{...s.badge(t?.type==="new"?T.bbg:T.bg4,t?.type==="new"?T.blue:T.text2),marginLeft:6,fontSize:10}}>{t?.type||"—"}</span>
                    <div style={{fontSize:12,color:rel.color,marginTop:3,fontWeight:600}}>● {rel.label} ({rel.score}%)</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:800,color:T.green}}>{peso(tot)}</div>
                    <div style={{fontSize:11,color:T.text3}}>{rb.length} months</div>
                  </div>
                </div>
                {rb.map(b=>{const ip=b.status==="paid";return(
                  <div key={b.month} style={{display:"flex",gap:9,padding:"9px 0",borderTop:`1px solid ${T.border}`}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:ip?T.green:b.status==="balance"?T.amber:T.red,marginTop:5,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontWeight:700,fontSize:13}}>{fmtMonth(b.month)}</span>
                        <span style={{fontWeight:800,color:ip?T.green:T.text}}>{peso(b.total)}</span>
                      </div>
                      <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={s.badge(ip?T.green:b.status==="balance"?T.abg:T.rbg,ip?"#071a0e":b.status==="balance"?T.amber:T.red)}>{b.status}</span>
                        {b.datePaid&&<span style={{fontSize:11,color:T.text3}}>Paid {b.datePaid}</span>}
                        {b.method&&<span style={{...s.badge(T.bg4,T.text2),fontSize:10}}>{b.method}</span>}
                      </div>
                      <div style={{fontSize:11,color:T.text3,marginTop:2}}>Rm {peso(b.rent)} + Elec {peso(b.elec)} + Water {peso(b.water)} + Wifi {peso(b.wifi)}{b.balTotal?` + Bal ${peso(b.balTotal)}`:""}</div>
                    </div>
                  </div>
                );})}
              </div>;
            })}
          </div>
        )}

      </div>
    </div>
  );
}
