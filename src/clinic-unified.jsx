import { useState, useEffect, useRef } from “react”;

// ════════════════════════════════════════════════
// 悠然堂整骨院 予約システム（統合版）
// 患者画面・管理画面を1ファイルに統合
// データはReact stateで一元管理
// ════════════════════════════════════════════════

const C = “#7c5c3e”;
const TODAY = new Date().toISOString().slice(0,10);
const DOW = [“日”,“月”,“火”,“水”,“木”,“金”,“土”];
const SL = { confirmed:“予約確定”, pending:“仮予約”, done:“施術完了”, cancelled:“キャンセル” };
const SC = {
confirmed:{ bg:”#e6f4ec”, color:”#2d7a4f” },
pending:  { bg:”#fff8e1”, color:”#a07020” },
done:     { bg:”#e8f0fb”, color:”#1a5fa8” },
cancelled:{ bg:”#fdecea”, color:”#b03030” },
};

// ── 日本の祝日計算 ─────────────────────────────────
// 春分・秋分は簡易式で計算（2020〜2030年対応）
function calcEquinox(year, isAutumn) {
// 春分: 3/20か21、秋分: 9/22か23 の近似
const base = isAutumn ? 23.2488 : 20.8431;
const d = Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
return `${year}-${isAutumn?"09":"03"}-${String(d).padStart(2,"0")}`;
}
function getJapaneseHolidays(year) {
const h = new Set([
`${year}-01-01`, // 元日
`${year}-02-11`, // 建国記念の日
`${year}-02-23`, // 天皇誕生日
`${year}-04-29`, // 昭和の日
`${year}-05-03`, // 憲法記念日
`${year}-05-04`, // みどりの日
`${year}-05-05`, // こどもの日
`${year}-08-11`, // 山の日
`${year}-11-03`, // 文化の日
`${year}-11-23`, // 勤労感謝の日
calcEquinox(year, false), // 春分の日
calcEquinox(year, true),  // 秋分の日
]);
// ハッピーマンデー計算
const nthMon = (m, n) => { // m=月(1-12), n=第n月曜
const d = new Date(year, m-1, 1);
const first = (8 - d.getDay()) % 7 + 1;
return `${year}-${String(m).padStart(2,"0")}-${String(first + (n-1)*7).padStart(2,"0")}`;
};
h.add(nthMon(1, 2)); // 成人の日 1月第2月曜
h.add(nthMon(7, 3)); // 海の日 7月第3月曜
h.add(nthMon(9, 3)); // 敬老の日 9月第3月曜
h.add(nthMon(10,2)); // スポーツの日 10月第2月曜
// 振替休日（日曜が祝日→翌月曜）
const extra = new Set();
h.forEach(ds => {
if (new Date(ds).getDay() === 0) {
const next = new Date(ds); next.setDate(next.getDate()+1);
extra.add(next.toISOString().slice(0,10));
}
});
extra.forEach(d => h.add(d));
return h;
}
// isHoliday: 日付文字列が祝日かどうか
const _holidayCache = {};
function isHoliday(dateStr) {
const year = parseInt(dateStr.slice(0,4));
if (!_holidayCache[year]) _holidayCache[year] = getJapaneseHolidays(year);
return _holidayCache[year].has(dateStr);
}

const D_STAFF = [
{ id:1, name:“院長 田村”, role:“鍼灸師・柔道整復師”, color:”#7c5c3e”, shifts:{ offDays:[], offDates:[] } },
{ id:2, name:“山下 恵子”, role:“鍼灸師”,             color:”#4a7c59”, shifts:{ offDays:[], offDates:[] } },
{ id:3, name:“中村 拓也”, role:“柔道整復師”,          color:”#2c5f8a”, shifts:{ offDays:[], offDates:[] } },
{ id:4, name:“橋本 千春”, role:“マッサージ師”,        color:”#8e44ad”, shifts:{ offDays:[], offDates:[] } },
];
const D_MENUS = [
{ id:1, name:“鍼灸治療（全身）”, duration:60, price:6000 },
{ id:2, name:“鍼灸治療（局所）”, duration:30, price:3500 },
{ id:3, name:“整骨施術”,         duration:30, price:3000 },
{ id:4, name:“マッサージ”,       duration:60, price:5500 },
{ id:5, name:“骨盤矯正”,         duration:45, price:4500 },
{ id:6, name:“電気治療”,         duration:20, price:2000 },
{ id:7, name:“初回問診・施術”,   duration:90, price:7000 },
];
const D_PATIENTS = [
{ id:1, name:“山田 花子”, kana:“やまだ はなこ”, tel:“090-1234-5678”, birth:“1985-03-15”, gender:“女性”, medical:“肩こり・腰痛”, notes:”” },
{ id:2, name:“鈴木 健太”, kana:“すずき けんた”,  tel:“080-9876-5432”, birth:“1970-07-22”, gender:“男性”, medical:“膝痛”,        notes:”” },
];
const D_BIZ = {
0:{open:false,start:“09:00”,end:“17:00”},
1:{open:true, start:“09:00”,end:“18:45”},
2:{open:true, start:“09:00”,end:“18:45”},
3:{open:true, start:“09:00”,end:“18:45”},
4:{open:true, start:“09:00”,end:“18:45”},
5:{open:true, start:“09:00”,end:“18:45”},
6:{open:true, start:“09:00”,end:“17:00”},
h:{open:false,start:“09:00”,end:“17:00”}, // 祝日設定
};

import { createClient } from “@supabase/supabase-js”;

// ════════════════════════════════════════════════
// ★ここにSupabaseの情報を入力してください★
// Supabase → Project Settings → API
const SUPABASE_URL = “https://your-project.supabase.co”;
const SUPABASE_KEY = “your-anon-public-key”;
// ════════════════════════════════════════════════

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Supabase データアクセス層 ─────────────────────────────
const DB = {
// スタッフ
async getStaff()            { const {data}=await sb.from(“ys_staff”).select(”*”).order(“id”); return data?.map(toStaff)||[]; },
async addStaff(r)           { const {data}=await sb.from(“ys_staff”).insert([fromStaff(r)]).select().single(); return data?toStaff(data):null; },
async updateStaff(id,r)     { await sb.from(“ys_staff”).update(fromStaff(r)).eq(“id”,id); },
async deleteStaff(id)       { await sb.from(“ys_staff”).delete().eq(“id”,id); },
// メニュー
async getMenus()            { const {data}=await sb.from(“ys_menus”).select(”*”).order(“id”); return data||[]; },
async addMenu(r)            { const {data}=await sb.from(“ys_menus”).insert([r]).select().single(); return data; },
async updateMenu(id,r)      { await sb.from(“ys_menus”).update(r).eq(“id”,id); },
async deleteMenu(id)        { await sb.from(“ys_menus”).delete().eq(“id”,id); },
// 患者
async getPatients()         { const {data}=await sb.from(“ys_patients”).select(”*”).order(“id”); return data||[]; },
async addPatient(r)         { const {data}=await sb.from(“ys_patients”).insert([r]).select().single(); return data; },
// 予約
async getBookings()         { const {data}=await sb.from(“ys_bookings”).select(”*”).order(“date”,{ascending:false}); return data?.map(toBooking)||[]; },
async addBooking(r)         { const {data}=await sb.from(“ys_bookings”).insert([fromBooking(r)]).select().single(); return data?toBooking(data):null; },
async updateBooking(id,r)   { await sb.from(“ys_bookings”).update(fromBooking(r)).eq(“id”,id); },
async deleteBooking(id)     { await sb.from(“ys_bookings”).delete().eq(“id”,id); },
// 設定
async getSetting(key,fb)    { const {data}=await sb.from(“ys_settings”).select(“value”).eq(“key”,key).single(); return data?.value??fb; },
async setSetting(key,value) { await sb.from(“ys_settings”).upsert({key,value,updated_at:new Date().toISOString()}); },
};

// snake_case ↔ camelCase 変換
const toStaff   = r => ({ id:r.id, name:r.name, role:r.role, color:r.color, shifts:r.shifts||{offDays:[],offDates:[]} });
const fromStaff = r => ({ name:r.name, role:r.role||””, color:r.color||”#7c5c3e”, shifts:r.shifts||{offDays:[],offDates:[]} });
const toBooking = r => ({
id:r.id, patientId:r.patient_id, patientName:r.patient_name, patientTel:r.patient_tel,
staffId:r.staff_id, menuItems:r.menu_items||[], menu:r.menu,
totalDuration:r.total_duration, totalPrice:r.total_price,
date:r.date, time:r.time, status:r.status, notes:r.notes, source:r.source
});
const fromBooking = r => ({
patient_id:r.patientId||null, patient_name:r.patientName||””, patient_tel:r.patientTel||””,
staff_id:r.staffId||null, menu_items:r.menuItems||[], menu:r.menu||””,
total_duration:r.totalDuration||0, total_price:r.totalPrice||0,
date:r.date, time:r.time, status:r.status||“pending”, notes:r.notes||””, source:r.source||“web”
});

function t2m(t){ const [h,m]=t.split(”:”).map(Number); return h*60+m; }

// dateStr=””: cutoff無効（管理者用）、今日の日付を渡すと過去枠除外
// cutoffMins: 何分前まで予約可能か
function genTimes(s, e, dateStr, cutoffMins){
const out=[], sm=t2m(s), em=t2m(e);
const isToday = dateStr === TODAY;
const now = new Date();
const threshold = isToday ? now.getHours()*60 + now.getMinutes() + (cutoffMins||0) : -1;
for(let h=9;h<=18;h++) for(let m=0;m<60;m+=15){
const c=h*60+m;
if(c < sm || c > em) continue;
if(isToday && c <= threshold) continue;
out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
}
return out;
}
function mLabel(b){ return b.menuItems?.length ? b.menuItems.map(x=>x.name).join(” / “) : b.menu||”（未設定）”; }

// 2つの予約が時間的に重複するか
function overlaps(t1, d1, t2, d2) {
const s1=t2m(t1), e1=s1+d1;
const s2=t2m(t2), e2=s2+d2;
return s1 < e2 && s2 < e1;
}

// ある時刻から durationMins 施術する枠が予約可能か判定
// staffId=“none” → スタッフ全員で空きがあるか / 数値 → そのスタッフが空きか
function isSlotAvailable(startTime, durationMins, staffId, date, bookings, allStaff, excludeId=null) {
if (!durationMins) return false;
const activeBookings = bookings.filter(b =>
b.date === date && b.status !== “cancelled” && b.id !== excludeId
);
const bDur = (b) => b.totalDuration > 0 ? b.totalDuration : 15;

if (staffId !== “none” && staffId != null && !isNaN(staffId)) {
// 指名あり：そのスタッフが出勤中かつ重複予約がないか
const s = allStaff.find(x => x.id == staffId);
if (s && !isStaffWorking(s, date)) return false;
return !activeBookings.some(b =>
b.staffId == staffId && overlaps(startTime, durationMins, b.time, bDur(b))
);
} else {
// 指名なし：出勤中スタッフのうち空きがある人がいるか
const workingStaff = allStaff.filter(s => isStaffWorking(s, date));
if (workingStaff.length === 0) return false;
const overlappingCount = activeBookings.filter(b =>
overlaps(startTime, durationMins, b.time, bDur(b))
).length;
return overlappingCount < workingStaff.length;
}
}

// 日付文字列から実際の営業時間設定を返す（祝日を優先）
function getBizHours(dateStr, biz) {
if (!dateStr) return null;
const dow = new Date(dateStr).getDay();
if (isHoliday(dateStr)) return biz[“h”] || biz[dow];
return biz[dow];
}

// スタッフがその日出勤しているか
function isStaffWorking(staff, dateStr) {
const shifts = staff.shifts || { offDays:[], offDates:[] };
const dow = new Date(dateStr).getDay();
if ((shifts.offDays||[]).includes(dow)) return false;
if ((shifts.offDates||[]).includes(dateStr)) return false;
return true;
}

// 終了時刻文字列を計算
function endTime(startTime, durationMins) {
const end = t2m(startTime) + durationMins;
return `${String(Math.floor(end/60)).padStart(2,"0")}:${String(end%60).padStart(2,"0")}`;
}

// ── 共通UI ───────────────────────────────────────
const IS = {width:“100%”,padding:“11px 12px”,border:“1.5px solid #d6cdc4”,borderRadius:8,fontSize:14,fontFamily:“inherit”,background:”#fffdf9”,boxSizing:“border-box”,outline:“none”,color:”#2d1f14”};

const Badge = ({status}) => {
const s=SC[status]||SC.pending;
return <span style={{background:s.bg,color:s.color,padding:“2px 10px”,borderRadius:20,fontSize:11,fontWeight:700}}>{SL[status]}</span>;
};
const Card = ({children,style}) => (

  <div style={{background:"white",border:"1px solid #ede4d8",borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 2px 8px rgba(80,40,10,0.06)",...style}}>{children}</div>
);
const Fld = ({label,req,children}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,fontWeight:700,color:"#9a8070",marginBottom:5,letterSpacing:"0.06em"}}>
      {label}{req&&<span style={{color:"#c0392b"}}> *</span>}
    </div>
    {children}
  </div>
);
const Btn = ({onClick,bg=C,children,sm,full,disabled}) => (
  <button onClick={onClick} disabled={disabled} style={{background:disabled?"#bbb":bg,color:"white",border:"none",borderRadius:8,padding:sm?"5px 11px":"10px 18px",fontSize:sm?11:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto",whiteSpace:"nowrap"}}>{children}</button>
);
const Sheet = ({open,onClose,title,children}) => !open?null:(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
    <div style={{background:"#fffdf9",width:"100%",maxWidth:600,margin:"0 auto",borderRadius:"16px 16px 0 0",padding:20,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <div style={{fontWeight:700,fontSize:15,color:C,marginBottom:14,paddingBottom:10,borderBottom:"1px solid #ede4d8"}}>{title}</div>
      {children}
    </div>
  </div>
);

// window.confirm の代替（Artifact環境対応）
const ConfirmDialog = ({open,message,onOk,onCancel,okLabel=“削除する”,okColor=”#b03030”}) => !open?null:(

  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:"white",borderRadius:14,padding:24,maxWidth:320,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:14,color:"#2d1f14",lineHeight:1.7,marginBottom:20,textAlign:"center"}}>{message}</div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:"11px",background:"#f0ebe4",color:C,border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>キャンセル</button>
        <button onClick={onOk}    style={{flex:1,padding:"11px",background:okColor,color:"white",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"}}>{okLabel}</button>
      </div>
    </div>
  </div>
);

// ── IDカウンタ（Supabase版ではDBのserialを使うため不要だがUIの一時IDに使用）
let _id = Date.now();
const uid = () => ++_id;

// ════════════════════════════════════════════════
// ルート — 全データここで管理
// ════════════════════════════════════════════════
export default function App() {
const [mode,     setMode]     = useState(“top”);
const [staff,    setStaff]    = useState([]);
const [menus,    setMenus]    = useState([]);
const [patients, setPatients] = useState([]);
const [bookings, setBookings] = useState([]);
const [biz,      setBiz]      = useState(D_BIZ);
const [adminPw,  setAdminPw]  = useState(””);
const [cutoff,   setCutoff]   = useState(30);
const [loading,  setLoading]  = useState(true);
const [dbError,  setDbError]  = useState(””);

// 初回ロード：Supabaseから全データ取得
useEffect(() => {
(async () => {
try {
const [s, m, p, b, bizVal, pw, co] = await Promise.all([
DB.getStaff(),
DB.getMenus(),
DB.getPatients(),
DB.getBookings(),
DB.getSetting(“biz”, D_BIZ),
DB.getSetting(“adminPw”, “”),
DB.getSetting(“cutoff”, 30),
]);
setStaff(s.length    ? s : D_STAFF);
setMenus(m.length    ? m : D_MENUS);
setPatients(p);
setBookings(b);
setBiz(bizVal);
setAdminPw(pw);
setCutoff(co);
} catch(e) {
setDbError(“データベースに接続できません。SUPABASE_URLとSUPABASE_KEYを確認してください。”);
} finally {
setLoading(false);
}
})();
}, []);

// ── DB操作ラッパー（state更新 + DB保存を同時に）────────

const addStaff = async (s) => {
const saved = await DB.addStaff(s);
if (saved) setStaff(p => […p, saved]);
};
const updateStaff = async (id, s) => {
await DB.updateStaff(id, s);
setStaff(p => p.map(x => x.id===id ? {…x,…s} : x));
};
const deleteStaff = async (id) => {
await DB.deleteStaff(id);
setStaff(p => p.filter(x => x.id!==id));
};

const addMenu = async (m) => {
const saved = await DB.addMenu(m);
if (saved) setMenus(p => […p, saved]);
};
const updateMenu = async (id, m) => {
await DB.updateMenu(id, m);
setMenus(p => p.map(x => x.id===id ? {…x,…m} : x));
};
const deleteMenu = async (id) => {
await DB.deleteMenu(id);
setMenus(p => p.filter(x => x.id!==id));
};

const addPatient = async (pt) => {
const saved = await DB.addPatient(pt);
if (saved) { setPatients(p => […p, saved]); return saved; }
return null;
};

const addBooking = async (b) => {
const saved = await DB.addBooking(b);
if (saved) setBookings(p => […p, saved]);
return saved;
};
const updateBooking = async (id, b) => {
await DB.updateBooking(id, b);
setBookings(p => p.map(x => x.id===id ? {…x,…b} : x));
};
const deleteBooking = async (id) => {
await DB.deleteBooking(id);
setBookings(p => p.filter(x => x.id!==id));
};

const saveBiz = async (v) => {
await DB.setSetting(“biz”, v);
setBiz(v);
};
const saveAdminPw = async (v) => {
await DB.setSetting(“adminPw”, v);
setAdminPw(v);
};
const saveCutoff = async (v) => {
await DB.setSetting(“cutoff”, v);
setCutoff(v);
};
const saveStaffShift = async (id, shifts) => {
await DB.updateStaff(id, {shifts});
setStaff(p => p.map(s => s.id===id ? {…s,shifts} : s));
};

// 後方互換：旧コードが setStaff(fn)/setBookings(fn) を使っている箇所用
const saveId = () => {}; // Supabase版では不要

if (loading) return (
<div style={{fontFamily:”‘Hiragino Sans’,sans-serif”,minHeight:“100vh”,display:“flex”,flexDirection:“column”,alignItems:“center”,justifyContent:“center”,background:“linear-gradient(160deg,#fdf8f2,#f0e8dc)”}}>
<div style={{fontSize:40,marginBottom:16}}>🌿</div>
<div style={{fontSize:14,color:”#9a8070”}}>データを読み込んでいます…</div>
{dbError&&<div style={{marginTop:20,padding:“12px 20px”,background:”#fdecea”,borderRadius:10,fontSize:13,color:”#b03030”,maxWidth:360,textAlign:“center”}}>{dbError}</div>}
</div>
);

const shared = {
staff, menus, patients, bookings, biz, adminPw, cutoff,
// セッター（コンポーネントから直接stateを書き換える旧パターン用）
setStaff, setMenus, setPatients, setBookings, setBiz: saveBiz,
setAdminPw: saveAdminPw, setCutoff: saveCutoff,
// DB経由の操作（推奨）
addStaff, updateStaff, deleteStaff,
addMenu, updateMenu, deleteMenu,
addPatient, addBooking, updateBooking, deleteBooking,
saveStaffShift,
saveId,
};

if(mode===“patient”) return <PatientView {…shared} onBack={()=>setMode(“top”)}/>;
if(mode===“admin”)   return <AdminLogin  {…shared} onBack={()=>setMode(“top”)}/>;

return (
<div style={{fontFamily:”‘Hiragino Sans’,‘Noto Sans JP’,sans-serif”,background:“linear-gradient(160deg,#fdf8f2,#f0e8dc)”,minHeight:“100vh”,display:“flex”,flexDirection:“column”,alignItems:“center”,justifyContent:“center”,padding:24}}>
<div style={{fontSize:44,marginBottom:10}}>🌿</div>
<div style={{fontFamily:”‘Hiragino Mincho ProN’,serif”,fontSize:22,fontWeight:600,color:”#2d1f14”,letterSpacing:“0.12em”,marginBottom:4}}>悠然堂整骨院</div>
<div style={{fontSize:13,color:”#9a8070”,marginBottom:44,letterSpacing:“0.1em”}}>予約システム</div>
<div style={{display:“flex”,flexDirection:“column”,gap:14,width:“100%”,maxWidth:340}}>
<button onClick={()=>setMode(“patient”)} style={{padding:“20px 24px”,background:`linear-gradient(135deg,${C},#a0744a)`,color:“white”,border:“none”,borderRadius:14,fontSize:15,fontWeight:700,cursor:“pointer”,boxShadow:“0 6px 24px rgba(124,92,62,0.35)”,textAlign:“left”}}>
<div style={{fontSize:24,marginBottom:6}}>🌱</div>
<div style={{marginBottom:3}}>ご予約はこちら</div>
<div style={{fontSize:12,opacity:0.8,fontWeight:400}}>患者様・ご新規の方</div>
</button>
<button onClick={()=>setMode(“admin”)} style={{padding:“20px 24px”,background:”#2d1f14”,color:”#c8b8a8”,border:“none”,borderRadius:14,fontSize:15,fontWeight:700,cursor:“pointer”,textAlign:“left”}}>
<div style={{fontSize:24,marginBottom:6}}>🔐</div>
<div style={{marginBottom:3}}>管理者画面</div>
<div style={{fontSize:12,opacity:0.6,fontWeight:400}}>スタッフ専用</div>
</button>
</div>
</div>
);
}

// ── PatientView用UIパーツ（外部定義で再マウント防止）──────
const PHeader = ({onBack}) => (

  <div style={{background:`linear-gradient(135deg,${C},#a0744a)`,color:"white",padding:"22px 20px 18px",textAlign:"center",position:"relative"}}>
    <button onClick={onBack} style={{position:"absolute",left:14,top:16,background:"none",border:"none",color:"rgba(255,255,255,0.8)",fontSize:22,cursor:"pointer"}}>←</button>
    <div style={{fontSize:26,marginBottom:3}}>🌿</div>
    <div style={{fontFamily:"'Hiragino Mincho ProN',serif",fontSize:19,fontWeight:600,letterSpacing:"0.12em"}}>悠然堂整骨院</div>
    <div style={{fontSize:11,opacity:0.8,letterSpacing:"0.15em",marginTop:2}}>オンライン予約</div>
  </div>
);
const PSteps = ({step}) => (
  <div style={{display:"flex",justifyContent:"center",padding:"14px 0 0"}}>
    {[["1","情報"],["2","確認"],["3","完了"]].map(([n,l],i)=>(
      <div key={n} style={{display:"flex",alignItems:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,background:step>i?"#4a7c59":step===i+1?C:"#ddd",color:step>=i+1?"white":"#aaa"}}>{step>i+1?"✓":n}</div>
          <div style={{fontSize:9,color:step===i+1?C:"#aaa",fontWeight:step===i+1?700:400}}>{l}</div>
        </div>
        {i<2&&<div style={{width:32,height:2,background:step>i+1?"#4a7c59":"#ddd",margin:"0 4px 14px"}}/>}
      </div>
    ))}
  </div>
);
const PSec = ({title,children}) => (
  <div style={{background:"white",borderRadius:12,padding:16,marginBottom:14,boxShadow:"0 2px 10px rgba(100,60,20,0.06)",border:"1px solid #ede4d8"}}>
    <div style={{fontSize:13,fontWeight:700,color:C,marginBottom:12}}>{title}</div>
    {children}
  </div>
);

// ════════════════════════════════════════════════
// 患者予約画面
// ════════════════════════════════════════════════
function PatientView({staff,menus,patients,bookings,biz,cutoff,addPatient,addBooking,onBack}) {
const [isNew,    setIsNew]    = useState(null);
const [found,    setFound]    = useState(null);
const [lupErr,   setLupErr]   = useState(””);
const [step,     setStep]     = useState(1);
const [selMIds,  setSelMIds]  = useState([]);
const [stfId,    setStfId]    = useState(“none”);
const [date,     setDate]     = useState(””);
const [time,     setTime]     = useState(””);
const [doneId,   setDoneId]   = useState(null);
const [err,      setErr]      = useState(””);
const [saving,   setSaving]   = useState(false);

// 全テキスト入力をrefで管理（re-renderによる再マウントを防ぐ）
const r = {
name:useRef(””), kana:useRef(””), tel:useRef(””),
gender:useRef(””), birth:useRef(””), med:useRef(””), notes:useRef(””),
lupTel:useRef(””),
};

const selMs    = menus.filter(m=>selMIds.includes(m.id));
const totDur   = selMs.reduce((s,m)=>s+m.duration,0);
const totPrice = selMs.reduce((s,m)=>s+m.price,0);
const selStf   = stfId!==“none” ? staff.find(s=>s.id==stfId) : null;
const dow      = date ? new Date(date).getDay() : null;
const hrs      = date ? getBizHours(date, biz) : null;
const isHol    = date ? isHoliday(date) : false;
const rawTimes = hrs?.open ? genTimes(hrs.start, hrs.end, date, cutoff) : [];
// 所要時間＋スタッフ空き状況を考慮して各枠の可否を計算
const slotStatus = rawTimes.map(t => {
if (!totDur) return {t, ok:false, noMenu:true}; // メニュー未選択は全枠グレー
const endMin = t2m(t) + totDur;
const endT = `${String(Math.floor(endMin/60)).padStart(2,"0")}:${String(endMin%60).padStart(2,"0")}`;
if (hrs && t2m(endT) > t2m(hrs.end)) return {t, ok:false, reason:“time”};
const ok = isSlotAvailable(t, totDur, stfId===“none”?“none”:parseInt(stfId), date, bookings, staff);
return {t, ok, endT};
});

const toggleM = id => { setSelMIds(p=>p.includes(id)?p.filter(x=>x!==id):[…p,id]); setTime(””); };

const lookup = () => {
const q=r.lupTel.current.trim().replace(/[-ー\s]/g,””);
if(!q){setLupErr(“電話番号を入力してください”);return;}
const f=patients.find(p=>p.tel.replace(/[-ー\s]/g,””)===q);
if(!f){setLupErr(“登録が見つかりませんでした。初回の方はお名前・情報をご入力ください。”);setFound(null);return;}
setLupErr(””); setFound(f);
r.name.current=f.name; r.kana.current=f.kana||””; r.tel.current=f.tel;
r.gender.current=f.gender||””; r.birth.current=f.birth||””; r.med.current=f.medical||””;
};

const validate = () => {
if(!r.name.current.trim()) return “お名前を入力してください”;
if(!r.tel.current.trim())  return “電話番号を入力してください”;
if(!selMIds.length)        return “施術メニューを選択してください”;
if(!date)                  return “ご希望日を選択してください”;
if(hrs&&!hrs.open)         return “選択した日は定休日です”;
if(!time)                  return “ご希望時間を選択してください”;
return “”;
};

const handleNext = () => { const e=validate(); if(e){setErr(e);return;} setErr(””); setStep(2); };

const handleConfirm = async () => {
setSaving(true);
try {
let patId = found?.id||null;
if(isNew&&!found){
const np = await addPatient({name:r.name.current,kana:r.kana.current,tel:r.tel.current,
gender:r.gender.current,birth:r.birth.current,medical:r.med.current,notes:””});
patId = np?.id||null;
}
const saved = await addBooking({
patientId:patId, patientName:r.name.current, patientTel:r.tel.current,
staffId:stfId===“none”?null:parseInt(stfId),
menuItems:selMs.map(m=>({id:m.id,name:m.name,duration:m.duration,price:m.price})),
menu:selMs.map(m=>m.name).join(” / “), totalDuration:totDur, totalPrice:totPrice,
date, time, status:“pending”, notes:r.notes.current, source:“web”,
});
setDoneId(saved?.id||“ok”); setStep(3);
} catch(e) {
setErr(“送信に失敗しました。しばらく待ってから再度お試しください。”);
} finally {
setSaving(false);
}
};

const reset = () => {
setIsNew(null);setFound(null);setLupErr(””); setStep(1);
Object.values(r).forEach(x=>x.current=””);
setSelMIds([]);setStfId(“none”);setDate(””);setTime(””);setDoneId(null);setErr(””);
};

const wrap = content => (
<div style={{fontFamily:”‘Hiragino Sans’,‘Noto Sans JP’,sans-serif”,background:“linear-gradient(160deg,#fdf8f2,#f5ede2)”,minHeight:“100vh”,color:”#2d1f14”}}>
<PHeader onBack={onBack}/>
<div style={{maxWidth:480,margin:“0 auto”,padding:“0 14px 60px”}}>{content}</div>
</div>
);

if(isNew===null) return wrap(
<div style={{paddingTop:24}}>
<div style={{textAlign:“center”,marginBottom:22,fontSize:14,color:”#9a8070”}}>ご来院は初めてですか？</div>
<div style={{display:“flex”,flexDirection:“column”,gap:12}}>
{[{f:true,i:“🌱”,t:“初めてのご来院”,s:“お名前・電話番号等をご入力いただきます”},
{f:false,i:“🏡”,t:“2回目以降のご来院”,s:“電話番号で患者情報を呼び出します”}].map(({f,i,t,s})=>(
<button key={String(f)} onClick={()=>setIsNew(f)} style={{padding:“18px”,background:“white”,border:“2px solid #d6cdc4”,borderRadius:12,cursor:“pointer”,textAlign:“left”,boxShadow:“0 2px 10px rgba(100,60,20,0.06)”}}>
<div style={{fontSize:22,marginBottom:5}}>{i}</div>
<div style={{fontWeight:700,fontSize:15,color:C,marginBottom:3}}>{t}</div>
<div style={{fontSize:12,color:”#9a8070”,lineHeight:1.5}}>{s}</div>
</button>
))}
</div>
</div>
);

if(isNew===false&&!found) return wrap(
<div style={{paddingTop:16}}>
<button onClick={()=>setIsNew(null)} style={{background:“none”,border:“none”,color:”#9a8070”,fontSize:13,cursor:“pointer”,marginBottom:12}}>← 戻る</button>
<PSec title="📞 電話番号でご確認">
<div style={{fontSize:13,color:”#9a8070”,marginBottom:14,lineHeight:1.7}}>ご登録の電話番号を入力してください。</div>
<Fld label="電話番号" req>
<input type=“tel” defaultValue=”” onChange={e=>{r.lupTel.current=e.target.value;}} onKeyDown={e=>e.key===“Enter”&&lookup()} placeholder=“090-0000-0000” style={IS}/>
</Fld>
{lupErr&&(
<div style={{background:”#fdecea”,border:“1px solid #f5c6cb”,borderRadius:10,padding:“10px 14px”,fontSize:13,color:”#c0392b”,marginBottom:12,lineHeight:1.6}}>
⚠️ {lupErr}
{lupErr.includes(“初回”)&&<div style={{marginTop:8}}><button onClick={()=>{setIsNew(true);setLupErr(””);r.lupTel.current=””;}} style={{background:C,color:“white”,border:“none”,borderRadius:7,padding:“6px 14px”,fontSize:12,cursor:“pointer”,fontWeight:700}}>初回として登録する →</button></div>}
</div>
)}
<button onClick={lookup} style={{width:“100%”,padding:“12px”,background:`linear-gradient(135deg,${C},#a0744a)`,color:“white”,border:“none”,borderRadius:10,fontSize:14,fontWeight:700,cursor:“pointer”}}>検索する</button>
</PSec>
</div>
);

if(step===1) return wrap(
<div>
<PSteps step={step}/>
<div style={{height:14}}/>

```
  <PSec title={isNew?"👤 お客様情報（初回登録）":`👤 ようこそ、${found?.name}様`}>
    {isNew?(
      <div>
        <Fld label="お名前" req><input type="text" defaultValue="" onChange={e=>{r.name.current=e.target.value;}} placeholder="山田 花子" style={IS}/></Fld>
        <Fld label="ふりがな"><input type="text" defaultValue="" onChange={e=>{r.kana.current=e.target.value;}} placeholder="やまだ はなこ" style={IS}/></Fld>
        <Fld label="電話番号" req><input type="tel" defaultValue="" onChange={e=>{r.tel.current=e.target.value;}} placeholder="090-0000-0000" style={IS}/></Fld>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="性別">
            <select defaultValue="" onChange={e=>{r.gender.current=e.target.value;}} style={IS}>
              <option value="">未選択</option><option>男性</option><option>女性</option><option>その他</option>
            </select>
          </Fld>
          <Fld label="生年月日"><input type="date" defaultValue="" onChange={e=>{r.birth.current=e.target.value;}} style={IS}/></Fld>
        </div>
        <Fld label="主訴・お悩み"><textarea defaultValue="" onChange={e=>{r.med.current=e.target.value;}} placeholder="肩こり、腰痛など" rows={3} style={{...IS,resize:"vertical"}}/></Fld>
      </div>
    ):(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          {[["お名前",found.name],["電話番号",found.tel]].map(([l,v])=>(
            <div key={l} style={{background:"#f9f5f0",borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:"#9a8070",fontWeight:700,marginBottom:2}}>{l}</div>
              <div style={{fontWeight:600,fontSize:13}}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>{setIsNew(null);setFound(null);r.lupTel.current="";}} style={{background:"none",border:"1px solid #d6cdc4",borderRadius:7,padding:"5px 12px",fontSize:12,color:"#9a8070",cursor:"pointer"}}>別の電話番号で検索</button>
      </div>
    )}
  </PSec>

  <PSec title="💆 施術メニュー（複数選択可）">
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {menus.map(m=>{const sel=selMIds.includes(m.id);return(
        <button key={m.id} onClick={()=>toggleM(m.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",border:`2px solid ${sel?C:"#d6cdc4"}`,borderRadius:10,background:sel?"#f5ede2":"white",cursor:"pointer",textAlign:"left"}}>
          <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${sel?C:"#ccc"}`,background:sel?C:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {sel&&<span style={{color:"white",fontSize:12,fontWeight:700}}>✓</span>}
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:sel?700:400,fontSize:13,color:sel?C:"#2d1f14"}}>{m.name}</div>
            <div style={{fontSize:11,color:"#9a8070",marginTop:1}}>⏱{m.duration}分　¥{m.price.toLocaleString()}</div>
          </div>
        </button>
      );})}
    </div>
    {!!selMIds.length&&<div style={{marginTop:12,background:`linear-gradient(135deg,${C},#a0744a)`,borderRadius:10,padding:"10px 14px",color:"white",display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700}}><span>合計 {totDur}分</span><span>¥{totPrice.toLocaleString()}</span></div>}
  </PSec>

  <PSec title="👨‍⚕️ 担当スタッフ">
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <button onClick={()=>{setStfId("none");setTime("");}} style={{padding:"11px 8px",border:`2px solid ${stfId==="none"?C:"#d6cdc4"}`,borderRadius:10,background:stfId==="none"?"#f5ede2":"white",cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:20,marginBottom:3}}>🎲</div>
        <div style={{fontSize:12,fontWeight:700,color:stfId==="none"?C:"#555"}}>指名なし</div>
      </button>
      {staff.map(s=>(
        <button key={s.id} onClick={()=>{setStfId(String(s.id));setTime("");}} style={{padding:"11px 8px",border:`2px solid ${stfId==s.id?C:"#d6cdc4"}`,borderRadius:10,background:stfId==s.id?"#f5ede2":"white",cursor:"pointer",textAlign:"center"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:s.color,margin:"0 auto 5px",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:13}}>{s.name.charAt(0)}</div>
          <div style={{fontSize:11,fontWeight:700,color:stfId==s.id?C:"#555",lineHeight:1.3}}>{s.name}</div>
          <div style={{fontSize:10,color:"#9a8070"}}>{s.role}</div>
        </button>
      ))}
    </div>
  </PSec>

  <PSec title="📅 ご希望日時">
    <Fld label="ご希望日" req>
      <input type="date" value={date} min={TODAY} onChange={e=>{setDate(e.target.value);setTime("");}} style={IS}/>
    </Fld>
    {date&&hrs&&!hrs.open&&<div style={{background:"#fdecea",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#c0392b",marginBottom:10}}>⚠️ 選択した日は{isHol?"祝日のため":""}定休日です。別の日をお選びください。</div>}
    {date&&isHol&&hrs?.open&&<div style={{background:"#fff8e1",borderRadius:8,padding:"7px 12px",fontSize:12,color:"#a07020",marginBottom:8}}>🎌 祝日営業（{hrs.start}〜{hrs.end}）</div>}
    {date&&hrs?.open&&(
      <Fld label={`ご希望時間（${hrs.start}〜${hrs.end}）`} req>
        {!totDur && <div style={{background:"#fff8e1",border:"1px solid #f0d98a",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#856404",marginBottom:8}}>⚠️ 先に施術メニューを選択してください</div>}
        {time && totDur > 0 && <div style={{background:"#e6f4ec",border:"1px solid #b8dfc8",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#2d7a4f",marginBottom:8,fontWeight:700}}>✓ {time} 〜 {endTime(time,totDur)} （{totDur}分）</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {slotStatus.map(({t,ok,endT})=>{
            const sel=time===t;
            return(
              <button key={t} disabled={!ok} onClick={()=>setTime(t)}
                style={{padding:"9px 4px",border:`2px solid ${sel?C:!ok?"#eee":"#d6cdc4"}`,borderRadius:8,
                  background:sel?C:!ok?"#f5f0eb":"white",
                  color:sel?"white":!ok?"#ccc":"#2d1f14",
                  fontSize:12,fontWeight:sel?700:400,cursor:!ok?"not-allowed":"pointer",
                  lineHeight:1.3,textAlign:"center"}}>
                <div>{t}</div>
                {totDur>0 && endT && ok && <div style={{fontSize:9,opacity:0.7,marginTop:1}}>〜{endT}</div>}
                {!ok && totDur>0 && <div style={{fontSize:9,color:"#ccc",marginTop:1}}>×</div>}
              </button>
            );
          })}
        </div>
        {slotStatus.length>0 && slotStatus.every(s=>!s.ok) && totDur>0 &&
          <div style={{marginTop:8,background:"#fdecea",border:"1px solid #f5c6cb",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#b03030"}}>
            この日は選択したメニューの空き枠がありません。日付を変えるかメニューをご確認ください。
          </div>
        }
      </Fld>
    )}
    {!date&&<div style={{padding:"10px 12px",background:"#f5f0eb",borderRadius:8,fontSize:13,color:"#aaa"}}>日付を選択してください</div>}
  </PSec>

  <PSec title="📝 ご要望・症状">
    <textarea defaultValue="" onChange={e=>{r.notes.current=e.target.value;}} placeholder="症状、気になる箇所、ご要望などをご自由にお書きください" rows={4} style={{...IS,resize:"vertical"}}/>
  </PSec>

  {err&&<div style={{background:"#fdecea",border:"1px solid #f5c6cb",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#c0392b",marginBottom:14}}>⚠️ {err}</div>}
  <button onClick={handleNext} style={{width:"100%",padding:"13px",background:`linear-gradient(135deg,${C},#a0744a)`,color:"white",border:"none",borderRadius:11,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(124,92,62,0.35)"}}>確認画面へ →</button>
</div>
```

);

if(step===2) return wrap(
<div>
<PSteps step={step}/>
<div style={{height:14}}/>
<PSec title="📋 予約内容のご確認">
{[
[“お名前”,  `${r.name.current}${r.kana.current?`　（${r.kana.current}）`:""}`],
[“電話番号”, r.tel.current],
[“施術”,    selMs.map(m=>`${m.name}（${m.duration}分）`).join(”\n”)],
[“合計”,    `${totDur}分　¥${totPrice.toLocaleString()}`],
[“担当”,    selStf?`${selStf.name}（${selStf.role}）`:“指名なし”],
[“日時”,    `${new Date(date).toLocaleDateString("ja-JP",{month:"long",day:"numeric",weekday:"short"})}　${time}`],
…(r.notes.current?[[“ご要望”,r.notes.current]]:[]),
].map(([l,v])=>(
<div key={l} style={{display:“flex”,gap:12,padding:“9px 0”,borderBottom:“1px solid #ede4d8”,fontSize:13}}>
<span style={{color:”#9a8070”,minWidth:65,fontSize:11,flexShrink:0,fontWeight:700,paddingTop:1}}>{l}</span>
<span style={{color:”#2d1f14”,lineHeight:1.6,whiteSpace:“pre-line”}}>{v}</span>
</div>
))}
<div style={{marginTop:14,background:”#fffbf0”,border:“1px solid #f0d98a”,borderRadius:10,padding:“10px 14px”,fontSize:12,color:”#856404”,lineHeight:1.7}}>⚠️ 予約は「仮予約」として受け付けます。後ほど当院よりご確認のご連絡をいたします。</div>
</PSec>
<div style={{display:“flex”,gap:10}}>
<button onClick={()=>setStep(1)} style={{flex:1,padding:“12px”,background:”#f0ebe4”,color:C,border:“none”,borderRadius:11,fontSize:14,fontWeight:600,cursor:“pointer”}}>← 修正する</button>
<button onClick={handleConfirm} disabled={saving} style={{flex:2,padding:“12px”,background:saving?”#aaa”:“linear-gradient(135deg,#4a7c59,#5d9e70)”,color:“white”,border:“none”,borderRadius:11,fontSize:14,fontWeight:700,cursor:saving?“not-allowed”:“pointer”,boxShadow:“0 4px 16px rgba(74,124,89,0.35)”}}>{saving?“送信中…”:“予約を確定する ✓”}</button>
</div>
</div>
);

return wrap(
<div style={{textAlign:“center”,paddingTop:24}}>
<PSteps step={step}/>
<div style={{marginTop:24,fontSize:52,marginBottom:14}}>🎉</div>
<div style={{fontSize:19,fontWeight:700,color:”#4a7c59”,marginBottom:6,fontFamily:”‘Hiragino Mincho ProN’,serif”}}>ご予約を受け付けました</div>
<div style={{fontSize:13,color:”#9a8070”,marginBottom:22}}>予約番号：<strong style={{color:C}}>#{doneId}</strong></div>
<Card style={{textAlign:“left”,marginBottom:22}}>
<div style={{fontWeight:700,color:C,marginBottom:10,fontSize:13}}>予約内容</div>
{[[“📅 日時”,`${new Date(date).toLocaleDateString("ja-JP",{month:"long",day:"numeric",weekday:"short"})} ${time}`],[“💆 施術”,selMs.map(m=>m.name).join(” / “)],[“⏱ 合計”,`${totDur}分`],[“💴 料金”,`¥${totPrice.toLocaleString()}`],[“👨‍⚕️ 担当”,selStf?selStf.name:“指名なし”]].map(([l,v])=>(
<div key={l} style={{display:“flex”,gap:10,padding:“7px 0”,borderBottom:“1px solid #f5ede2”,fontSize:13}}>
<span style={{minWidth:75,color:”#9a8070”,fontSize:12}}>{l}</span><span style={{fontWeight:500}}>{v}</span>
</div>
))}
</Card>
<p style={{fontSize:13,color:”#9a8070”,lineHeight:1.8,marginBottom:24}}>確認のご連絡をさせていただきます。<br/>ご不明な点はお電話にてお問い合わせください。</p>
<div style={{display:“flex”,gap:10,justifyContent:“center”}}>
<button onClick={reset} style={{padding:“12px 24px”,background:`linear-gradient(135deg,${C},#a0744a)`,color:“white”,border:“none”,borderRadius:11,fontSize:14,fontWeight:700,cursor:“pointer”}}>別の予約をする</button>
<button onClick={onBack} style={{padding:“12px 24px”,background:”#f0ebe4”,color:C,border:“none”,borderRadius:11,fontSize:14,fontWeight:600,cursor:“pointer”}}>トップへ</button>
</div>
</div>
);
}

// ════════════════════════════════════════════════
// 管理者ログイン画面
// ════════════════════════════════════════════════
function AdminLogin(props) {
const {adminPw, onBack} = props;
const [input,  setInput]  = useState(””);
const [err,    setErr]    = useState(””);
const [authed, setAuthed] = useState(false);

// パスワード未設定なら直接入場
if (!adminPw || authed) return <AdminView {…props} />;

const login = () => {
if (input === adminPw) { setAuthed(true); setErr(””); }
else { setErr(“パスワードが違います”); setInput(””); }
};

return (
<div style={{fontFamily:”‘Hiragino Sans’,‘Noto Sans JP’,sans-serif”,background:“linear-gradient(160deg,#1a1208,#2d1f14)”,minHeight:“100vh”,display:“flex”,flexDirection:“column”,alignItems:“center”,justifyContent:“center”,padding:24}}>
<button onClick={onBack} style={{position:“absolute”,top:16,left:16,background:“none”,border:“none”,color:“rgba(255,255,255,0.5)”,fontSize:20,cursor:“pointer”}}>←</button>
<div style={{fontSize:36,marginBottom:12}}>🔐</div>
<div style={{fontFamily:”‘Hiragino Mincho ProN’,serif”,fontSize:18,fontWeight:600,color:”#c8b8a8”,letterSpacing:“0.12em”,marginBottom:4}}>管理者ログイン</div>
<div style={{fontSize:12,color:”#7a6050”,marginBottom:32}}>悠然堂整骨院</div>
<div style={{width:“100%”,maxWidth:320}}>
<input
type=“password”
value={input}
onChange={e=>setInput(e.target.value)}
onKeyDown={e=>e.key===“Enter”&&login()}
placeholder=“パスワードを入力”
style={{width:“100%”,padding:“13px 16px”,border:`1.5px solid ${err?"#b03030":"#3d2f24"}`,borderRadius:10,fontSize:15,fontFamily:“inherit”,background:”#1a1208”,boxSizing:“border-box”,outline:“none”,color:”#fdf8f2”,marginBottom:10}}
/>
{err && <div style={{color:”#e07070”,fontSize:13,marginBottom:10,textAlign:“center”}}>⚠️ {err}</div>}
<button onClick={login} style={{width:“100%”,padding:“13px”,background:`linear-gradient(135deg,${C},#a0744a)`,color:“white”,border:“none”,borderRadius:10,fontSize:14,fontWeight:700,cursor:“pointer”,boxShadow:“0 4px 16px rgba(124,92,62,0.4)”}}>
ログイン
</button>
</div>
</div>
);
}

// ════════════════════════════════════════════════
// 管理者画面
// ════════════════════════════════════════════════
function AdminView({staff,setStaff,menus,setMenus,patients,setPatients,bookings,setBookings,biz,setBiz,adminPw,setAdminPw,saveId,onBack,
addStaff,updateStaff,deleteStaff,addMenu,updateMenu,deleteMenu,addPatient,addBooking,updateBooking,deleteBooking,saveStaffShift,cutoff,setCutoff}) {
const [page, setPage] = useState(“dash”);
const [mOpen,setMOpen]= useState(false);
const [toast,setToast]= useState(null);
const msg = (t,type=””)=>{ setToast({t,type}); setTimeout(()=>setToast(null),2400); };
const getPN  = b => b.patientName||patients.find(p=>p.id==b.patientId)?.name||“不明”;
const sName  = id => id?staff.find(s=>s.id==id)?.name||“不明”:“指名なし”;
const sColor = id => staff.find(s=>s.id==id)?.color||”#ccc”;
const pendB  = bookings.filter(b=>b.status===“pending”);
const todayB = bookings.filter(b=>b.date===TODAY&&b.status!==“cancelled”);
const ws=new Date(); ws.setDate(ws.getDate()-ws.getDay());
const weekB  = bookings.filter(b=>b.status!==“cancelled”&&new Date(b.date)>=ws);
const monB   = bookings.filter(b=>b.status!==“cancelled”&&b.date.slice(0,7)===TODAY.slice(0,7));

const NAV=[{k:“dash”,i:“🏠”,l:“ホーム”},{k:“newbook”,i:“➕”,l:“新規予約”},{k:“list”,i:“📋”,l:“予約一覧”},{k:“cal”,i:“📅”,l:“カレンダー”},{k:“pats”,i:“👤”,l:“患者”},{k:“newpat”,i:“🆕”,l:“患者登録”},{k:“stf”,i:“👨‍⚕️”,l:“スタッフ”},{k:“mns”,i:“🍽”,l:“メニュー”},{k:“biz”,i:“🕐”,l:“営業時間”},{k:“cfg”,i:“⚙️”,l:“設定”}];
const BOT=[{k:“dash”,i:“🏠”,l:“ホーム”},{k:“newbook”,i:“➕”,l:“予約”},{k:“list”,i:“📋”,l:“一覧”},{k:“cal”,i:“📅”,l:“暦”},{k:“pats”,i:“👤”,l:“患者”},{k:“biz”,i:“🕐”,l:“時間”},{k:“mns”,i:“🍽”,l:“メニュー”}];
const sh={staff,setStaff,menus,setMenus,patients,setPatients,bookings,setBookings,biz,setBiz,adminPw,setAdminPw,saveId,msg,getPN,sName,sColor,setPage,pendB,todayB,weekB,monB,
addStaff,updateStaff,deleteStaff,addMenu,updateMenu,deleteMenu,addPatient,addBooking,updateBooking,deleteBooking,saveStaffShift,cutoff,setCutoff};

return (
<div style={{fontFamily:”‘Hiragino Sans’,‘Noto Sans JP’,sans-serif”,background:”#faf6f0”,minHeight:“100vh”,color:”#2d1f14”,fontSize:14}}>
<div style={{background:”#2d1f14”,color:”#fdf8f2”,padding:“0 16px”,height:52,display:“flex”,alignItems:“center”,justifyContent:“space-between”,position:“sticky”,top:0,zIndex:100,boxShadow:“0 2px 12px rgba(0,0,0,0.3)”}}>
<div>
<div style={{fontSize:13,fontWeight:700}}>🏥 悠然堂整骨院 予約システム</div>
<div style={{fontSize:10,color:”#a89080”}}>管理者画面</div>
</div>
<div style={{display:“flex”,alignItems:“center”,gap:10}}>
{pendB.length>0&&<button onClick={()=>{setPage(“list”);setMOpen(false);}} style={{background:”#b03030”,color:“white”,border:“none”,borderRadius:20,padding:“3px 10px”,fontSize:11,fontWeight:700,cursor:“pointer”}}>仮予約 {pendB.length}件</button>}
<button onClick={()=>setMOpen(!mOpen)} style={{background:“none”,border:“none”,color:“white”,fontSize:22,cursor:“pointer”}}>☰</button>
</div>
</div>

```
  {mOpen&&(
    <div style={{position:"fixed",inset:0,zIndex:200}} onClick={()=>setMOpen(false)}>
      <div style={{position:"absolute",top:0,right:0,bottom:0,width:220,background:"#2d1f14",padding:"16px 0",boxShadow:"-4px 0 24px rgba(0,0,0,0.4)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"8px 18px 12px",fontSize:10,color:"#7a6050",fontWeight:700,letterSpacing:"0.12em"}}>MENU</div>
        {NAV.map(n=><button key={n.k} onClick={()=>{setPage(n.k);setMOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 18px",background:page===n.k?"#7c5c3e":"transparent",color:page===n.k?"white":"#c8b8a8",border:"none",fontSize:13,cursor:"pointer",textAlign:"left"}}><span style={{fontSize:15}}>{n.i}</span><span>{n.l}</span></button>)}
        <div style={{margin:"12px 0 8px",borderTop:"1px solid #3d2f24"}}/>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 18px",background:"transparent",color:"#7a6050",border:"none",fontSize:13,cursor:"pointer"}}><span>←</span><span>トップへ戻る</span></button>
      </div>
    </div>
  )}

  <div style={{padding:14,maxWidth:600,margin:"0 auto"}}>
    {page==="dash"   &&<ADash    {...sh}/>}
    {page==="newbook"&&<ANewBook {...sh}/>}
    {page==="list"   &&<AList   {...sh}/>}
    {page==="cal"    &&<ACal    {...sh}/>}
    {page==="pats"   &&<APats   {...sh}/>}
    {page==="newpat" &&<ANewPat {...sh}/>}
    {page==="stf"    &&<AStaff  {...sh}/>}
    {page==="mns"    &&<AMenus  {...sh}/>}
    {page==="biz"    &&<ABiz    {...sh}/>}
    {page==="cfg"    &&<AConfig {...sh}/>}
  </div>

  <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#2d1f14",display:"flex",borderTop:"1px solid #3d2f24"}}>
    {BOT.map(n=><button key={n.k} onClick={()=>setPage(n.k)} style={{flex:1,padding:"7px 2px 5px",background:"none",border:"none",color:page===n.k?"#c49a6c":"#7a6050",fontSize:9,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:15}}>{n.i}</span>{n.l}</button>)}
  </div>
  <div style={{height:60}}/>
  {toast&&<div style={{position:"fixed",bottom:70,left:"50%",transform:"translateX(-50%)",background:"#2d1f14",color:"white",padding:"9px 18px",borderRadius:8,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",zIndex:999,whiteSpace:"nowrap",borderLeft:`4px solid ${toast.type==="success"?"#4a7c59":toast.type==="error"?"#c0392b":C}`}}>{toast.t}</div>}
</div>
```

);
}

function ADash({todayB,weekB,monB,pendB,patients,biz,staff,getPN,sName,setPage,updateBooking,msg}) {
const dh=getBizHours(TODAY, biz);
const todayIsHol=isHoliday(TODAY);
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>🏠 ダッシュボード</div>
<div style={{background:dh?.open?”#e6f4ec”:”#fdecea”,border:`1px solid ${dh?.open?"#b8dfc8":"#f5c6cb"}`,borderRadius:10,padding:“9px 14px”,marginBottom:12,display:“flex”,justifyContent:“space-between”,alignItems:“center”,fontSize:13}}>
<span style={{fontWeight:700,color:dh?.open?”#2d7a4f”:”#b03030”}}>{dh?.open?“🟢 本日営業中”:“🔴 本日定休日”}{todayIsHol&&” 🎌祝”}</span>
{dh?.open&&<span style={{color:”#2d7a4f”,fontSize:12}}>{dh.start}〜{dh.end}</span>}
</div>
{pendB.length>0&&(
<Card style={{borderLeft:“4px solid #a07020”}}>
<div style={{fontWeight:700,color:”#a07020”,marginBottom:10,fontSize:13}}>📩 未確認の仮予約　{pendB.length}件</div>
{pendB.map(b=>(
<div key={b.id} style={{display:“flex”,alignItems:“center”,gap:8,padding:“6px 0”,borderBottom:“1px solid #f5ede2”,fontSize:12}}>
<span style={{color:C,minWidth:90,fontSize:11}}>{b.date} {b.time}</span>
<span style={{flex:1}}>{getPN(b)}</span>
{b.source===“web”&&<span style={{fontSize:10,background:”#e8f0fb”,color:”#1a5fa8”,padding:“1px 6px”,borderRadius:10}}>WEB</span>}
<Btn sm bg=”#4a7c59” onClick={()=>{updateBooking(b.id,{…b,status:“confirmed”});msg(“確定しました”,“success”);}}>確定</Btn>
<Btn sm bg=”#b03030” onClick={()=>{updateBooking(b.id,{…b,status:“cancelled”});msg(“取消しました”);}}>取消</Btn>
</div>
))}
</Card>
)}
<div style={{display:“grid”,gridTemplateColumns:“1fr 1fr”,gap:10,marginBottom:12}}>
{[[“本日の予約”,todayB.length,”#7c5c3e”],[“今週”,weekB.length,”#4a7c59”],[“患者数”,patients.length,”#2c5f8a”],[“今月”,monB.length,”#8e44ad”]].map(([l,v,c])=>(
<Card key={l} style={{textAlign:“center”,padding:14}}><div style={{fontSize:28,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:11,color:”#9a8070”,marginTop:2}}>{l}</div></Card>
))}
</div>
<Card>
<div style={{fontWeight:700,color:C,marginBottom:10,fontSize:13}}>📅 本日の予約</div>
{todayB.length===0?<div style={{color:”#bbb”,textAlign:“center”,padding:18,fontSize:13}}>本日の予約はありません</div>
:todayB.sort((a,b)=>a.time.localeCompare(b.time)).map(b=>(
<div key={b.id} style={{display:“flex”,alignItems:“center”,gap:8,padding:“7px 0”,borderBottom:“1px solid #f5ede2”}}>
<span style={{fontWeight:700,color:C,minWidth:46,fontSize:13}}>{b.time}</span>
<div style={{flex:1}}><div style={{fontSize:13}}>{getPN(b)}</div><div style={{fontSize:11,color:”#9a8070”}}>{mLabel(b)}</div></div>
<span style={{fontSize:11,color:”#9a8070”}}>{sName(b.staffId)}</span>
<Badge status={b.status}/>
</div>
))}
</Card>
</>;
}

function ANewBook({patients,staff,menus,bookings,biz,addBooking,msg,setPage,cutoff}) {
const [patId,setPatId]=useState(””); const [stId,setStId]=useState(“none”);
const [selMIds,setSelMIds]=useState([]); const [date,setDate]=useState(TODAY);
const [time,setTime]=useState(””); const [status,setStatus]=useState(“confirmed”);
const notesRef=useRef(””);
const selMs=menus.filter(m=>selMIds.includes(m.id));
const totDur=selMs.reduce((s,m)=>s+m.duration,0); const totPrc=selMs.reduce((s,m)=>s+m.price,0);
const dow=date?new Date(date).getDay():null; const hrs=date?getBizHours(date,biz):null;
// 管理者はcutoffなし（全時間帯）、過去判定だけ
const allTimes=hrs?.open?genTimes(hrs.start,hrs.end,””,””):[];
const now=new Date(); const nowMins=now.getHours()*60+now.getMinutes();
const isPast=(t)=>date===TODAY && t2m(t)<=nowMins;
// 所要時間＋スタッフ空き状況で各枠の可否
const adminSlotStatus = allTimes.map(t => {
if (!totDur) { const past=isPast(t); return {t, ok:!isPast(t), past}; }
const endMin=t2m(t)+totDur, endT=`${String(Math.floor(endMin/60)).padStart(2,"0")}:${String(endMin%60).padStart(2,"0")}`;
if (hrs && t2m(endT) > t2m(hrs.end)) return {t, ok:false, past:isPast(t), endT, reason:“time”};
const ok = isSlotAvailable(t, totDur, stId===“none”?“none”:parseInt(stId), date, bookings, staff);
return {t, ok, past:isPast(t), endT};
});
const toggleM=id=>{setSelMIds(p=>p.includes(id)?p.filter(x=>x!==id):[…p,id]);setTime(””);};
const submit=async()=>{
if(!patId||!selMIds.length||!date||!time){msg(“必須項目を入力してください”,“error”);return;}
const p=patients.find(x=>x.id==patId);
await addBooking({patientId:parseInt(patId),patientName:p?.name||””,patientTel:p?.tel||””,staffId:stId===“none”?null:parseInt(stId),menuItems:selMs.map(m=>({id:m.id,name:m.name,duration:m.duration,price:m.price})),menu:selMs.map(m=>m.name).join(” / “),totalDuration:totDur,totalPrice:totPrc,date,time,status,notes:notesRef.current,source:“admin”});
setPatId(””);setStId(“none”);setSelMIds([]);setTime(””);notesRef.current=””;setDate(TODAY);
msg(“予約を登録しました”,“success”);setPage(“list”);
};
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>➕ 新規予約登録</div>
<Card>
<Fld label="患者様" req><select value={patId} onChange={e=>setPatId(e.target.value)} style={IS}><option value="">── 選択 ──</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Fld>
<Fld label="担当スタッフ"><select value={stId} onChange={e=>{setStId(e.target.value);setTime(””);}} style={IS}><option value="none">指名なし（お任せ）</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}（{s.role}）</option>)}</select></Fld>
<Fld label="施術メニュー（複数可）" req>
<div style={{display:“flex”,flexDirection:“column”,gap:5}}>
{menus.map(m=>{const sel=selMIds.includes(m.id);return(
<button key={m.id} onClick={()=>toggleM(m.id)} style={{display:“flex”,alignItems:“center”,gap:8,padding:“8px 10px”,border:`2px solid ${sel?C:"#d6cdc4"}`,borderRadius:7,background:sel?”#f5ede2”:“white”,cursor:“pointer”,textAlign:“left”}}>
<div style={{width:16,height:16,borderRadius:3,border:`2px solid ${sel?C:"#ccc"}`,background:sel?C:“white”,display:“flex”,alignItems:“center”,justifyContent:“center”,flexShrink:0}}>{sel&&<span style={{color:“white”,fontSize:10,fontWeight:700}}>✓</span>}</div>
<span style={{fontSize:13,flex:1,color:sel?C:”#2d1f14”,fontWeight:sel?700:400}}>{m.name}</span>
<span style={{fontSize:11,color:”#9a8070”}}>{m.duration}分　¥{m.price.toLocaleString()}</span>
</button>
);})}
</div>
{!!selMIds.length&&<div style={{marginTop:8,background:`linear-gradient(135deg,${C},#a0744a)`,borderRadius:7,padding:“7px 12px”,color:“white”,fontSize:12,display:“flex”,justifyContent:“space-between”,fontWeight:700}}><span>合計 {totDur}分</span><span>¥{totPrc.toLocaleString()}</span></div>}
</Fld>
<Fld label="予約日" req><input type=“date” value={date} onChange={e=>{setDate(e.target.value);setTime(””);}} style={IS}/></Fld>
{date&&hrs&&!hrs.open&&<div style={{background:”#fdecea”,borderRadius:7,padding:“7px 12px”,fontSize:12,color:”#b03030”,marginBottom:10}}>⚠️ この曜日は定休日です</div>}
{date&&hrs?.open&&(
<Fld label={`時間（${hrs.start}〜${hrs.end}）`} req>
{time&&totDur>0&&<div style={{background:”#e6f4ec”,border:“1px solid #b8dfc8”,borderRadius:7,padding:“6px 10px”,fontSize:12,color:”#2d7a4f”,marginBottom:8,fontWeight:700}}>✓ {time} 〜 {endTime(time,totDur)} （{totDur}分）</div>}
<div style={{display:“grid”,gridTemplateColumns:“repeat(5,1fr)”,gap:4}}>
{adminSlotStatus.map(({t,ok,past,endT})=>{
const sel=time===t;
// 管理者は×でも選択可（強制入力できる）、ただし色で状態を表示
const isBlocked = !ok && !past;
return(<button key={t} onClick={()=>setTime(t)} style={{
padding:“7px 2px”,border:`2px solid ${sel?C:isBlocked?"#f5b8c4":past?"#e0d8d0":"#d6cdc4"}`,
borderRadius:6,background:sel?C:isBlocked?”#fdecea”:past?”#f5f0eb”:“white”,
color:sel?“white”:isBlocked?”#b03030”:past?”#bbb”:”#2d1f14”,
fontSize:11,cursor:“pointer”,fontWeight:sel?700:400,position:“relative”,lineHeight:1.3
}}>
<div>{t}</div>
{totDur>0&&endT&&<div style={{fontSize:8,opacity:0.6,marginTop:1}}>〜{endT}</div>}
{past&&!sel&&<span style={{position:“absolute”,top:1,right:2,fontSize:8,color:”#bbb”}}>済</span>}
{isBlocked&&!sel&&<span style={{position:“absolute”,top:1,right:2,fontSize:8,color:”#c0392b”}}>満</span>}
</button>);
})}
</div>
<div style={{marginTop:6,fontSize:11,color:”#9a8070”,lineHeight:1.6}}>
<span style={{color:”#b03030”}}>■</span> 満 = 空きなし（管理者は強制入力可）　
<span style={{color:”#bbb”}}>■</span> 済 = 過去の時間帯
</div>
</Fld>
)}
<Fld label="ステータス"><select value={status} onChange={e=>setStatus(e.target.value)} style={IS}><option value="confirmed">予約確定</option><option value="pending">仮予約</option></select></Fld>
<Fld label="備考"><textarea defaultValue=”” onChange={e=>{notesRef.current=e.target.value;}} placeholder=“症状、注意事項など” rows={3} style={{…IS,resize:“vertical”}}/></Fld>
<Btn full onClick={submit}>予約を登録する</Btn>
</Card>
</>;
}

function AList({bookings,staff,menus,getPN,sName,sColor,msg,updateBooking,deleteBooking}) {
const [search,setSearch]=useState(””); const [dateF,setDateF]=useState(””); const [stfF,setStfF]=useState(””); const [stF,setStF]=useState(“all”); const [ed,setEd]=useState(null);
const [confirmId,setConfirmId]=useState(null);
const filt=bookings.filter(b=>{
if(stF!==“all”&&b.status!==stF)return false;
if(dateF&&b.date!==dateF)return false;
if(stfF&&b.staffId!=stfF)return false;
if(search){const q=search.toLowerCase();if(!getPN(b).toLowerCase().includes(q)&&!sName(b.staffId).toLowerCase().includes(q))return false;}
return true;
}).sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time));
const confirmB = confirmId ? bookings.find(b=>b.id===confirmId) : null;
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>📋 予約一覧</div>
<Card>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder=“🔍 患者名・担当者で検索” style={IS}/>
<div style={{display:“flex”,gap:8,marginTop:8}}>
<input type=“date” value={dateF} onChange={e=>setDateF(e.target.value)} style={{…IS,flex:1}}/>
<select value={stfF} onChange={e=>setStfF(e.target.value)} style={{…IS,flex:1}}><option value="">全スタッフ</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
</div>
<div style={{display:“flex”,gap:4,marginTop:8,flexWrap:“wrap”}}>
{[“all”,“confirmed”,“pending”,“done”,“cancelled”].map(s=>(
<button key={s} onClick={()=>setStF(s)} style={{padding:“4px 11px”,borderRadius:20,border:`1.5px solid ${stF===s?C:"#d6cdc4"}`,background:stF===s?C:“transparent”,color:stF===s?“white”:”#9a8070”,fontSize:11,cursor:“pointer”}}>{s===“all”?“全て”:SL[s]}</button>
))}
</div>
</Card>
{filt.length===0?<div style={{textAlign:“center”,color:”#bbb”,padding:32}}>該当する予約がありません</div>:filt.map(b=>(
<Card key={b.id}>
<div style={{display:“flex”,justifyContent:“space-between”,alignItems:“flex-start”,marginBottom:5}}>
<div><span style={{fontWeight:700,fontSize:15}}>{getPN(b)}</span><span style={{fontSize:11,color:”#bbb”,marginLeft:6}}>#{b.id}</span>{b.source===“web”&&<span style={{fontSize:10,background:”#e8f0fb”,color:”#1a5fa8”,padding:“1px 6px”,borderRadius:10,marginLeft:6}}>WEB</span>}</div>
<Badge status={b.status}/>
</div>
<div style={{fontSize:12,color:”#7a6050”,marginBottom:2}}>📅 {new Date(b.date).toLocaleDateString(“ja-JP”,{month:“numeric”,day:“numeric”,weekday:“short”})} {b.time}{b.totalDuration?` 〜 ${endTime(b.time,b.totalDuration)}`:””}</div>
<div style={{fontSize:12,color:”#7a6050”,marginBottom:2}}>💆 {mLabel(b)}</div>
{b.totalDuration&&<div style={{fontSize:11,color:”#9a8070”,marginBottom:4}}>　合計 {b.totalDuration}分　¥{b.totalPrice?.toLocaleString()}</div>}
<div style={{fontSize:12,color:”#9a8070”,marginBottom:8}}>{b.staffId?<><span style={{display:“inline-block”,width:8,height:8,borderRadius:“50%”,background:sColor(b.staffId),marginRight:4}}/>{sName(b.staffId)}</>:“👥 指名なし”}{b.notes&&<span style={{marginLeft:8,color:”#bbb”}}>・{b.notes}</span>}</div>
<div style={{display:“flex”,gap:5,flexWrap:“wrap”}}>
<Btn sm bg=”#2c5f8a” onClick={()=>setEd({…b})}>編集</Btn>
{b.status===“pending”&&<Btn sm bg=”#4a7c59” onClick={()=>{updateBooking(b.id,{…b,status:“confirmed”});msg(“確定しました”,“success”);}}>確定</Btn>}
{b.status===“confirmed”&&<Btn sm bg=”#4a7c59” onClick={()=>{updateBooking(b.id,{…b,status:“done”});msg(“完了にしました”,“success”);}}>完了</Btn>}
{b.status!==“cancelled”&&<Btn sm bg=”#b03030” onClick={()=>updateBooking(b.id,{…b,status:“cancelled”})}>取消</Btn>}
<Btn sm bg=”#5a3a2a” onClick={()=>setConfirmId(b.id)}>削除</Btn>
</div>
</Card>
))}
<Sheet open={!!ed} onClose={()=>setEd(null)} title=“✏️ 予約を編集”>
{ed&&<EditForm ed={ed} setEd={setEd} staff={staff} menus={menus} bookings={bookings} updateBooking={updateBooking} msg={msg} onClose={()=>setEd(null)}/>}
</Sheet>
<ConfirmDialog
open={!!confirmId}
message={confirmB?`${getPN(confirmB)} 様\n${confirmB.date} ${confirmB.time}\n\nこの予約を完全に削除しますか？\nこの操作は取り消せません。`:””}
okLabel=“完全に削除する”
onOk={()=>{deleteBooking(confirmId);msg(“削除しました”);setConfirmId(null);}}
onCancel={()=>setConfirmId(null)}
/>
</>;
}

function EditForm({ed,setEd,staff,menus,bookings,updateBooking,msg,onClose}) {
const edMIds=ed.menuItems?ed.menuItems.map(m=>m.id):[];
const edDur=ed.menuItems?ed.menuItems.reduce((s,m)=>s+m.duration,0):(ed.totalDuration||30);
const dow=ed.date?new Date(ed.date).getDay():null;
const allTimes=genTimes(“09:00”,“18:45”,””,””); // 管理者は全時間
const now=new Date(); const nowMins=now.getHours()*60+now.getMinutes();
const isPast=(t)=>ed.date===TODAY && t2m(t)<=nowMins;
const slotStatus=allTimes.map(t=>{
const endMin=t2m(t)+edDur;
const endT=`${String(Math.floor(endMin/60)).padStart(2,"0")}:${String(endMin%60).padStart(2,"0")}`;
const ok=isSlotAvailable(t,edDur,ed.staffId||“none”,ed.date,bookings,staff,ed.id);
return {t,ok,past:isPast(t),endT};
});
const toggleM=id=>{
const cur=ed.menuItems||[],ex=cur.find(m=>m.id===id),fm=menus.find(m=>m.id===id);
const ni=ex?cur.filter(m=>m.id!==id):[…cur,{id:fm.id,name:fm.name,duration:fm.duration,price:fm.price}];
setEd({…ed,menuItems:ni,menu:ni.map(m=>m.name).join(” / “),
totalDuration:ni.reduce((s,m)=>s+m.duration,0),totalPrice:ni.reduce((s,m)=>s+m.price,0)});
};
return <>
<Fld label="施術メニュー（複数可）">
<div style={{display:“flex”,flexDirection:“column”,gap:5,marginBottom:8}}>
{menus.map(m=>{const sel=edMIds.includes(m.id);return(
<button key={m.id} onClick={()=>toggleM(m.id)} style={{display:“flex”,alignItems:“center”,gap:8,padding:“7px 10px”,border:`2px solid ${sel?C:"#d6cdc4"}`,borderRadius:7,background:sel?”#f5ede2”:“white”,cursor:“pointer”,textAlign:“left”}}>
<div style={{width:15,height:15,borderRadius:3,border:`2px solid ${sel?C:"#ccc"}`,background:sel?C:“white”,display:“flex”,alignItems:“center”,justifyContent:“center”,flexShrink:0}}>{sel&&<span style={{color:“white”,fontSize:10,fontWeight:700}}>✓</span>}</div>
<span style={{fontSize:12,flex:1,color:sel?C:”#2d1f14”,fontWeight:sel?700:400}}>{m.name}</span>
<span style={{fontSize:11,color:”#9a8070”}}>{m.duration}分</span>
</button>
);})}
</div>
{edDur>0&&<div style={{background:`linear-gradient(135deg,${C},#a0744a)`,borderRadius:7,padding:“6px 12px”,color:“white”,fontSize:12,fontWeight:700}}>合計 {edDur}分</div>}
</Fld>
<Fld label="担当スタッフ"><select value={ed.staffId||“none”} onChange={e=>setEd({…ed,staffId:e.target.value===“none”?null:parseInt(e.target.value)})} style={IS}><option value="none">指名なし</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Fld>
<Fld label="日付"><input type=“date” value={ed.date} onChange={e=>setEd({…ed,date:e.target.value})} style={IS}/></Fld>
<Fld label="時間">
{ed.time&&edDur>0&&<div style={{background:”#e6f4ec”,border:“1px solid #b8dfc8”,borderRadius:7,padding:“5px 10px”,fontSize:12,color:”#2d7a4f”,marginBottom:6,fontWeight:700}}>✓ {ed.time} 〜 {endTime(ed.time,edDur)}</div>}
<div style={{display:“grid”,gridTemplateColumns:“repeat(5,1fr)”,gap:4}}>
{slotStatus.map(({t,ok,past,endT})=>{
const sel=ed.time===t;
const blocked=!ok&&!past;
return(<button key={t} onClick={()=>setEd({…ed,time:t})} style={{
padding:“6px 2px”,border:`2px solid ${sel?C:blocked?"#f5b8c4":past?"#e0d8d0":"#d6cdc4"}`,
borderRadius:6,background:sel?C:blocked?”#fdecea”:past?”#f5f0eb”:“white”,
color:sel?“white”:blocked?”#b03030”:past?”#bbb”:”#2d1f14”,
fontSize:10,cursor:“pointer”,fontWeight:sel?700:400,position:“relative”,lineHeight:1.3
}}>
<div>{t}</div>
{endT&&<div style={{fontSize:8,opacity:0.6}}>〜{endT}</div>}
{past&&!sel&&<span style={{position:“absolute”,top:0,right:1,fontSize:8,color:”#bbb”}}>済</span>}
{blocked&&!sel&&<span style={{position:“absolute”,top:0,right:1,fontSize:8,color:”#c0392b”}}>満</span>}
</button>);
})}
</div>
</Fld>
<Fld label="ステータス"><select value={ed.status} onChange={e=>setEd({…ed,status:e.target.value})} style={IS}><option value="confirmed">予約確定</option><option value="pending">仮予約</option><option value="done">施術完了</option><option value="cancelled">キャンセル</option></select></Fld>
<Fld label="備考"><textarea defaultValue={ed.notes||””} onChange={e=>setEd({…ed,notes:e.target.value})} rows={3} style={{…IS,resize:“vertical”}}/></Fld>
<div style={{display:“flex”,gap:8}}><Btn onClick={()=>{updateBooking(ed.id,ed);msg(“更新しました”,“success”);onClose();}}>保存</Btn><Btn bg="#888" onClick={onClose}>閉じる</Btn></div>
</>;
}

function ACal({bookings,biz,getPN,sName,sColor}) {
const now=new Date(); const [cy,setCy]=useState(now.getFullYear()); const [cm,setCm]=useState(now.getMonth()); const [sel,setSel]=useState(null);
const days=()=>{const f=new Date(cy,cm,1),l=new Date(cy,cm+1,0),c=[];for(let i=0;i<f.getDay();i++)c.push(null);for(let d=1;d<=l.getDate();d++)c.push(d);return c;};
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>📅 カレンダー</div>
<Card>
<div style={{display:“flex”,alignItems:“center”,justifyContent:“space-between”,marginBottom:12}}>
<button onClick={()=>{if(cm===0){setCm(11);setCy(y=>y-1);}else setCm(m=>m-1);}} style={{background:“none”,border:“1px solid #d6cdc4”,borderRadius:6,padding:“4px 10px”,cursor:“pointer”}}>◀</button>
<span style={{fontWeight:700,color:C,fontSize:14}}>{cy}年{cm+1}月</span>
<button onClick={()=>{if(cm===11){setCm(0);setCy(y=>y+1);}else setCm(m=>m+1);}} style={{background:“none”,border:“1px solid #d6cdc4”,borderRadius:6,padding:“4px 10px”,cursor:“pointer”}}>▶</button>
</div>
<div style={{display:“grid”,gridTemplateColumns:“repeat(7,1fr)”,gap:2,textAlign:“center”}}>
{DOW.map((d,i)=><div key={d} style={{fontSize:11,fontWeight:700,color:i===0?”#b03030”:i===6?”#2c5f8a”:”#9a8070”,padding:4}}>{d}</div>)}
{days().map((d,i)=>{if(!d)return<div key={i}/>;const ds=`${cy}-${String(cm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const dow=new Date(cy,cm,d).getDay(),hol=isHoliday(ds),bhours=getBizHours(ds,biz),isOpen=bhours?.open,isToday=ds===TODAY,cnt=bookings.filter(b=>b.date===ds&&b.status!==“cancelled”).length;return(<div key={i} onClick={()=>setSel(ds)} style={{aspectRatio:“1”,display:“flex”,flexDirection:“column”,alignItems:“center”,justifyContent:“center”,borderRadius:7,cursor:“pointer”,fontSize:12,background:isToday?C:sel===ds?”#f5ede2”:isOpen?“transparent”:”#f9f4ef”,color:isToday?“white”:!isOpen?”#ccc”:hol?”#8e44ad”:dow===0?”#b03030”:dow===6?”#2c5f8a”:”#2d1f14”,fontWeight:isToday?700:400,opacity:isOpen?1:0.6}}>{d}{cnt>0&&<span style={{fontSize:8,color:isToday?“white”:”#4a7c59”,fontWeight:700}}>{cnt}</span>}{!isOpen&&<span style={{fontSize:7,color:”#bbb”}}>休</span>}{hol&&isOpen&&<span style={{fontSize:7,color:”#8e44ad”}}>祝</span>}</div>);})}
</div>
</Card>
{sel&&<Card><div style={{fontWeight:700,color:C,marginBottom:10,fontSize:13}}>{new Date(sel).toLocaleDateString(“ja-JP”,{month:“long”,day:“numeric”,weekday:“short”})}の予約</div>{bookings.filter(b=>b.date===sel&&b.status!==“cancelled”).sort((a,b)=>a.time.localeCompare(b.time)).map(b=>(<div key={b.id} style={{display:“flex”,alignItems:“center”,gap:8,padding:“7px 0”,borderBottom:“1px solid #f5ede2”}}><span style={{fontWeight:700,color:C,minWidth:46}}>{b.time}</span><div style={{flex:1}}><div style={{fontSize:13}}>{getPN(b)}</div><div style={{fontSize:11,color:”#9a8070”}}>{mLabel(b)}</div></div><span style={{fontSize:11,color:”#9a8070”}}>{b.staffId?<><span style={{display:“inline-block”,width:7,height:7,borderRadius:“50%”,background:sColor(b.staffId),marginRight:4}}/>{sName(b.staffId)}</>:“指名なし”}</span><Badge status={b.status}/></div>))}{!bookings.some(b=>b.date===sel&&b.status!==“cancelled”)&&<div style={{color:”#bbb”,textAlign:“center”,padding:14}}>予約はありません</div>}</Card>}
</>;
}

function APats({patients,bookings,setPage}) {
const [q,setQ]=useState(””); const [det,setDet]=useState(null);
const fp=patients.filter(p=>!q||p.name.includes(q)||p.kana?.includes(q)||p.tel.includes(q));
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>👤 患者管理</div>
<Card><input value={q} onChange={e=>setQ(e.target.value)} placeholder=“🔍 名前・電話番号で検索” style={IS}/></Card>
{fp.map(p=>{const cnt=bookings.filter(b=>b.patientId==p.id&&b.status!==“cancelled”).length;return(
<Card key={p.id}>
<div style={{display:“flex”,justifyContent:“space-between”}}><div><div style={{fontWeight:700,fontSize:15}}>{p.name}</div><div style={{fontSize:12,color:”#9a8070”}}>{p.kana}</div></div><span style={{fontSize:11,color:”#9a8070”}}>予約 {cnt}回</span></div>
<div style={{fontSize:12,color:”#7a6050”,marginTop:5}}>📞 {p.tel}</div>
{p.medical&&<div style={{fontSize:12,color:”#7a6050”,marginTop:2}}>🩺 {p.medical}</div>}
<div style={{display:“flex”,gap:6,marginTop:8}}><Btn sm onClick={()=>setDet(p)}>詳細</Btn><Btn sm bg=”#4a7c59” onClick={()=>setPage(“newbook”)}>予約登録</Btn></div>
</Card>
);})}
<Sheet open={!!det} onClose={()=>setDet(null)} title={`👤 ${det?.name||""}`}>
{det&&<>
{[[“ふりがな”,det.kana],[“電話”,det.tel],[“性別”,det.gender],[“生年月日”,det.birth?new Date(det.birth).toLocaleDateString(“ja-JP”):”-”],[“主訴”,det.medical],[“備考”,det.notes]].filter(([,v])=>v).map(([l,v])=>(<div key={l} style={{display:“flex”,gap:8,padding:“7px 0”,borderBottom:“1px solid #f5ede2”,fontSize:13}}><span style={{color:”#9a8070”,minWidth:60,fontSize:11}}>{l}</span><span>{v}</span></div>))}
<div style={{fontWeight:700,color:C,margin:“12px 0 8px”,fontSize:12}}>来院履歴</div>
{bookings.filter(b=>b.patientId==det.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(b=>(<div key={b.id} style={{display:“flex”,gap:8,alignItems:“center”,padding:“5px 0”,borderBottom:“1px solid #f5ede2”,fontSize:12}}><span style={{color:C,minWidth:80}}>{new Date(b.date).toLocaleDateString(“ja-JP”,{month:“numeric”,day:“numeric”})} {b.time}</span><span style={{flex:1}}>{mLabel(b)}</span><Badge status={b.status}/></div>))}
</>}
</Sheet>
</>;
}

function ANewPat({addPatient,msg,setPage}) {
const r={name:useRef(””),kana:useRef(””),tel:useRef(””),birth:useRef(””),gender:useRef(””),med:useRef(””),notes:useRef(””)};
const submit=async()=>{if(!r.name.current||!r.tel.current){msg(“氏名と電話番号は必須です”,“error”);return;}await addPatient({name:r.name.current,kana:r.kana.current,tel:r.tel.current,birth:r.birth.current,gender:r.gender.current,medical:r.med.current,notes:r.notes.current});msg(“患者を登録しました”,“success”);setPage(“pats”);};
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>🆕 患者登録</div>
<Card>
<Fld label="氏名" req><input type=“text” defaultValue=”” onChange={e=>{r.name.current=e.target.value;}} placeholder=“山田 花子” style={IS}/></Fld>
<Fld label="ふりがな"><input type=“text” defaultValue=”” onChange={e=>{r.kana.current=e.target.value;}} placeholder=“やまだ はなこ” style={IS}/></Fld>
<Fld label="電話番号" req><input type=“tel” defaultValue=”” onChange={e=>{r.tel.current=e.target.value;}} placeholder=“090-0000-0000” style={IS}/></Fld>
<div style={{display:“grid”,gridTemplateColumns:“1fr 1fr”,gap:10}}>
<Fld label="生年月日"><input type=“date” defaultValue=”” onChange={e=>{r.birth.current=e.target.value;}} style={IS}/></Fld>
<Fld label="性別"><select defaultValue=”” onChange={e=>{r.gender.current=e.target.value;}} style={IS}><option value="">未選択</option><option>男性</option><option>女性</option><option>その他</option></select></Fld>
</div>
<Fld label="主訴・既往歴"><textarea defaultValue=”” onChange={e=>{r.med.current=e.target.value;}} placeholder=“肩こり、腰痛など” rows={3} style={{…IS,resize:“vertical”}}/></Fld>
<Fld label="備考"><textarea defaultValue=”” onChange={e=>{r.notes.current=e.target.value;}} placeholder=“アレルギー、注意事項など” rows={2} style={{…IS,resize:“vertical”}}/></Fld>
<Btn full onClick={submit}>患者を登録する</Btn>
</Card>
</>;
}

// シフト管理シート（スタッフ1人分）
function ShiftEditor({s, onSave, onClose}) {
const shifts = s.shifts || {offDays:[], offDates:[]};
const [offDays,  setOffDays]  = useState(shifts.offDays  || []);
const [offDates, setOffDates] = useState(shifts.offDates || []);
const [newDate,  setNewDate]  = useState(””);

const toggleDay = (d) => setOffDays(p => p.includes(d) ? p.filter(x=>x!==d) : […p,d].sort());
const addDate   = () => {
if (!newDate || offDates.includes(newDate)) return;
setOffDates(p => […p, newDate].sort()); setNewDate(””);
};
const removeDate = (d) => setOffDates(p => p.filter(x=>x!==d));

return <>
<div style={{marginBottom:16}}>
<div style={{fontSize:12,fontWeight:700,color:”#9a8070”,marginBottom:10}}>定休曜日（毎週）</div>
<div style={{display:“flex”,gap:6,flexWrap:“wrap”}}>
{DOW.map((d,i)=>(
<button key={i} onClick={()=>toggleDay(i)} style={{
width:40,height:40,borderRadius:“50%”,border:`2px solid ${offDays.includes(i)?C:"#d6cdc4"}`,
background:offDays.includes(i)?C:“white”,
color:offDays.includes(i)?“white”:i===0?”#b03030”:i===6?”#2c5f8a”:”#2d1f14”,
fontWeight:700,fontSize:13,cursor:“pointer”
}}>{d}</button>
))}
</div>
{offDays.length>0&&<div style={{marginTop:8,fontSize:12,color:”#9a8070”}}>
毎週 {offDays.map(d=>DOW[d]).join(”・”)} 曜日は休み
</div>}
</div>

```
<div style={{marginBottom:16}}>
  <div style={{fontSize:12,fontWeight:700,color:"#9a8070",marginBottom:10}}>個別休日（特定日）</div>
  <div style={{display:"flex",gap:8,marginBottom:8}}>
    <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
      style={{...IS,flex:1}}/>
    <Btn bg="#4a7c59" onClick={addDate}>追加</Btn>
  </div>
  {offDates.length===0 && <div style={{fontSize:12,color:"#bbb"}}>個別休日なし</div>}
  <div style={{display:"flex",flexDirection:"column",gap:4}}>
    {offDates.map(d=>(
      <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:"#fdecea",borderRadius:7,fontSize:12}}>
        <span>{new Date(d).toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"})}</span>
        <button onClick={()=>removeDate(d)} style={{background:"none",border:"none",color:"#b03030",fontSize:14,cursor:"pointer",fontWeight:700}}>×</button>
      </div>
    ))}
  </div>
</div>

<div style={{display:"flex",gap:8}}>
  <Btn full bg="#4a7c59" onClick={()=>onSave({offDays,offDates})}>保存</Btn>
  <Btn bg="#888" onClick={onClose}>閉じる</Btn>
</div>
```

</>;
}

function AStaff({staff,bookings,msg,addStaff,deleteStaff,saveStaffShift}) {
const nr=useRef(””),rr=useRef(””); const [color,setColor]=useState(C);
const [confirmId,setConfirmId]=useState(null);
const [shiftStf, setShiftStf]=useState(null); // シフト編集中のスタッフ
const confirmS=confirmId?staff.find(s=>s.id===confirmId):null;

const saveShift=(sid,shifts)=>{
saveStaffShift(sid,shifts);
setShiftStf(null); msg(“シフトを保存しました”,“success”);
};

return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>👨‍⚕️ スタッフ管理</div>
{staff.map(s=>{
const cnt=bookings.filter(b=>b.staffId==s.id&&b.status!==“cancelled”).length;
const tc =bookings.filter(b=>b.staffId==s.id&&b.date===TODAY&&b.status!==“cancelled”).length;
const shifts=s.shifts||{offDays:[],offDates:[]};
const offDayStr = shifts.offDays?.length ? `毎週 ${shifts.offDays.map(d=>DOW[d]).join("・")}` : “”;
const isOffToday = !isStaffWorking(s, TODAY);
return (
<Card key={s.id}>
<div style={{display:“flex”,alignItems:“center”,gap:12,marginBottom:shifts.offDays?.length||shifts.offDates?.length?10:0}}>
<div style={{width:38,height:38,borderRadius:“50%”,background:s.color,display:“flex”,alignItems:“center”,justifyContent:“center”,color:“white”,fontWeight:700,fontSize:15,flexShrink:0,position:“relative”}}>
{s.name.charAt(0)}
{isOffToday&&<span style={{position:“absolute”,bottom:-2,right:-2,background:”#b03030”,borderRadius:“50%”,width:14,height:14,display:“flex”,alignItems:“center”,justifyContent:“center”,fontSize:8,color:“white”,border:“1px solid white”}}>休</span>}
</div>
<div style={{flex:1}}>
<div style={{fontWeight:700}}>{s.name} {isOffToday&&<span style={{fontSize:10,background:”#fdecea”,color:”#b03030”,padding:“1px 6px”,borderRadius:10,marginLeft:4}}>本日休み</span>}</div>
<div style={{fontSize:12,color:”#9a8070”}}>{s.role}</div>
</div>
<div style={{textAlign:“right”,fontSize:12,color:”#9a8070”,marginRight:4}}>
<div>本日 <strong>{tc}</strong>件</div>
<div>累計 <strong>{cnt}</strong>件</div>
</div>
<div style={{display:“flex”,flexDirection:“column”,gap:4}}>
<Btn sm bg=”#2c5f8a” onClick={()=>setShiftStf(s)}>シフト</Btn>
<Btn sm bg=”#b03030” onClick={()=>setConfirmId(s.id)}>削除</Btn>
</div>
</div>
{(offDayStr||shifts.offDates?.length>0)&&(
<div style={{fontSize:11,color:”#9a8070”,background:”#f9f4ef”,borderRadius:6,padding:“5px 10px”,lineHeight:1.8}}>
{offDayStr&&<div>🗓 定休: {offDayStr}曜日</div>}
{shifts.offDates?.length>0&&<div>📅 個別: {shifts.offDates.slice(0,3).map(d=>d.slice(5)).join(”, “)}{shifts.offDates.length>3?` 他${shifts.offDates.length-3}件`:””}</div>}
</div>
)}
</Card>
);
})}

```
<Card>
  <div style={{fontWeight:700,color:C,marginBottom:12,fontSize:13}}>スタッフを追加</div>
  <Fld label="氏名" req><input type="text" defaultValue="" onChange={e=>{nr.current=e.target.value;}} placeholder="佐々木 二郎" style={IS}/></Fld>
  <Fld label="資格・役職"><input type="text" defaultValue="" onChange={e=>{rr.current=e.target.value;}} placeholder="鍼灸師など" style={IS}/></Fld>
  <Fld label="カラー"><input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:48,height:34,border:"1.5px solid #d6cdc4",borderRadius:6,cursor:"pointer"}}/></Fld>
  <Btn onClick={()=>{if(!nr.current){msg("氏名を入力してください","error");return;}addStaff({name:nr.current,role:rr.current,color,shifts:{offDays:[],offDates:[]}});nr.current="";rr.current="";msg("追加しました","success");}}>追加</Btn>
</Card>

<Sheet open={!!shiftStf} onClose={()=>setShiftStf(null)} title={`🗓 ${shiftStf?.name||""} のシフト設定`}>
  {shiftStf&&<ShiftEditor s={shiftStf} onSave={(sh)=>saveShift(shiftStf.id,sh)} onClose={()=>setShiftStf(null)}/>}
</Sheet>

<ConfirmDialog
  open={!!confirmId}
  message={confirmS?`${confirmS.name}を削除しますか？\n削除後は元に戻せません。`:""}
  okLabel="削除する"
  onOk={()=>{deleteStaff(confirmId);msg("削除しました");setConfirmId(null);}}
  onCancel={()=>setConfirmId(null)}
/>
```

</>;
}

function AMenus({menus,msg,addMenu,updateMenu,deleteMenu}) {
const nr=useRef(””); const [dur,setDur]=useState(“30”); const [price,setPrice]=useState(””); const [ed,setEd]=useState(null);
const [confirmId,setConfirmId]=useState(null);
const confirmM=confirmId?menus.find(m=>m.id===confirmId):null;
const DURS=[15,20,30,45,60,75,90,120];
return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>🍽 メニュー管理</div>
{menus.map(m=>(
<Card key={m.id}><div style={{display:“flex”,alignItems:“center”,gap:10}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{m.name}</div><div style={{fontSize:12,color:”#9a8070”,marginTop:2,display:“flex”,gap:10}}><span>⏱{m.duration}分</span><span>¥{m.price.toLocaleString()}</span></div></div><Btn sm bg=”#2c5f8a” onClick={()=>setEd({…m,price:String(m.price)})}>編集</Btn><Btn sm bg=”#b03030” onClick={()=>setConfirmId(m.id)}>削除</Btn></div></Card>
))}
<Card style={{borderTop:`3px solid ${C}`}}>
<div style={{fontWeight:700,color:C,marginBottom:12,fontSize:13}}>＋ 新しいメニューを追加</div>
<Fld label="メニュー名" req><input type=“text” defaultValue=”” onChange={e=>{nr.current=e.target.value;}} placeholder=“例：温灸治療” style={IS}/></Fld>
<div style={{display:“grid”,gridTemplateColumns:“1fr 1fr”,gap:10}}>
<Fld label="所要時間" req><select value={dur} onChange={e=>setDur(e.target.value)} style={IS}>{DURS.map(d=><option key={d} value={d}>{d}分</option>)}</select></Fld>
<Fld label="料金（円）" req><input type=“number” value={price} onChange={e=>setPrice(e.target.value)} placeholder=“5000” style={IS}/></Fld>
</div>
<Btn full onClick={()=>{if(!nr.current.trim()||!price){msg(“メニュー名と料金を入力してください”,“error”);return;}addMenu({name:nr.current.trim(),duration:parseInt(dur),price:parseInt(price)});nr.current=””;setPrice(””);msg(“追加しました”,“success”);}}>メニューを追加する</Btn>
</Card>
<Sheet open={!!ed} onClose={()=>setEd(null)} title=“✏️ メニューを編集”>
{ed&&<><Fld label="メニュー名" req><input type=“text” defaultValue={ed.name} onChange={e=>setEd({…ed,name:e.target.value})} style={IS}/></Fld><div style={{display:“grid”,gridTemplateColumns:“1fr 1fr”,gap:10}}><Fld label="所要時間" req><select value={ed.duration} onChange={e=>setEd({…ed,duration:parseInt(e.target.value)})} style={IS}>{DURS.map(d=><option key={d} value={d}>{d}分</option>)}</select></Fld><Fld label="料金（円）" req><input type=“number” value={ed.price} onChange={e=>setEd({…ed,price:e.target.value})} style={IS}/></Fld></div><div style={{display:“flex”,gap:8}}><Btn onClick={()=>{if(!ed.name.trim()||!ed.price){msg(“入力してください”,“error”);return;}updateMenu(ed.id,{name:ed.name,duration:ed.duration,price:parseInt(ed.price)});setEd(null);msg(“更新しました”,“success”);}}>保存</Btn><Btn bg=”#888” onClick={()=>setEd(null)}>閉じる</Btn></div></>}
</Sheet>
<ConfirmDialog
open={!!confirmId}
message={confirmM?`「${confirmM.name}」を削除しますか？`:””}
okLabel=“削除する”
onOk={()=>{deleteMenu(confirmId);msg(“削除しました”);setConfirmId(null);}}
onCancel={()=>setConfirmId(null)}
/>
</>;
}

// ABiz用の行コンポーネント（外部定義でHooksルール準拠）
function BizRow({d, label, icon, color, h, upd, TO}) {
return (
<Card><div style={{display:“flex”,alignItems:“center”,gap:12}}>
<div style={{width:38,height:38,borderRadius:“50%”,flexShrink:0,
background:h.open?”#f5ede2”:”#f0ece8”,
display:“flex”,alignItems:“center”,justifyContent:“center”,
fontWeight:700,fontSize:d===“h”?13:15,color:color,
border:`2px solid ${h.open?"#d6cdc4":"#e8ddd4"}`}}>
{icon||(d!==“h”&&DOW[d])}
</div>
<div style={{flex:1}}>
{label&&<div style={{fontSize:11,color:”#9a8070”,marginBottom:5,fontWeight:700}}>{label}</div>}
<div style={{display:“flex”,gap:8,marginBottom:h.open?10:0}}>
<button onClick={()=>upd(d,“open”,true)} style={{padding:“4px 14px”,borderRadius:20,border:“none”,fontSize:12,fontWeight:700,cursor:“pointer”,background:h.open?”#4a7c59”:”#f0ece8”,color:h.open?“white”:”#9a8070”}}>営業</button>
<button onClick={()=>upd(d,“open”,false)} style={{padding:“4px 14px”,borderRadius:20,border:“none”,fontSize:12,fontWeight:700,cursor:“pointer”,background:!h.open?”#b03030”:”#f0ece8”,color:!h.open?“white”:”#9a8070”}}>定休日</button>
</div>
{h.open&&<div style={{display:“flex”,alignItems:“center”,gap:8}}>
<select value={h.start} onChange={e=>upd(d,“start”,e.target.value)} style={{flex:1,padding:“7px 8px”,border:“1.5px solid #d6cdc4”,borderRadius:7,fontSize:13,fontFamily:“inherit”,background:”#fffdf9”,outline:“none”}}>{TO.map(t=><option key={t} value={t}>{t}</option>)}</select>
<span style={{color:”#9a8070”}}>〜</span>
<select value={h.end} onChange={e=>upd(d,“end”,e.target.value)} style={{flex:1,padding:“7px 8px”,border:“1.5px solid #d6cdc4”,borderRadius:7,fontSize:13,fontFamily:“inherit”,background:”#fffdf9”,outline:“none”}}>{TO.map(t=><option key={t} value={t}>{t}</option>)}</select>
</div>}
</div>
</div></Card>
);
}

function ABiz({biz,setBiz,msg}) {
const [loc,setLoc]=useState(()=>{
const c={};
for(let i=0;i<7;i++) c[i]={…(biz[i]||D_BIZ[i])};
c[“h”]={…(biz[“h”]||D_BIZ[“h”]||{open:false,start:“09:00”,end:“17:00”})};
return c;
});
const TO=[]; for(let h=8;h<=20;h++) for(let m=0;m<60;m+=15) TO.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
const upd=(d,f,v)=>setLoc(p=>({…p,[d]:{…p[d],[f]:v}}));
const DC=[”#b03030”,”#444”,”#444”,”#444”,”#444”,”#444”,”#2c5f8a”];

return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>🕐 営業時間設定</div>
<div style={{background:”#fffbf0”,border:“1px solid #f0d98a”,borderRadius:10,padding:“9px 14px”,marginBottom:12,fontSize:12,color:”#856404”}}>⚠️ ここで設定した営業時間は患者様の予約フォームに反映されます。</div>

```
<div style={{fontSize:12,fontWeight:700,color:"#9a8070",marginBottom:8,letterSpacing:"0.06em"}}>📅 曜日別設定</div>
{[0,1,2,3,4,5,6].map(d=><BizRow key={d} d={d} color={DC[d]} h={loc[d]} upd={upd} TO={TO}/>)}

<div style={{fontSize:12,fontWeight:700,color:"#9a8070",margin:"16px 0 8px",letterSpacing:"0.06em"}}>🎌 祝日設定</div>
<div style={{background:"#f9f4ff",border:"1px solid #d8c8f0",borderRadius:10,padding:"9px 14px",marginBottom:10,fontSize:12,color:"#6a4fa0"}}>
  祝日は曜日設定より優先されます。「営業」を選ぶと祝日も通常営業します。
</div>
<BizRow d="h" color="#8e44ad" label="祝日" icon="🎌" h={loc["h"]} upd={upd} TO={TO}/>

<Btn full bg="#4a7c59" onClick={()=>{setBiz(loc);msg("営業時間を保存しました","success");}}>営業時間を保存する</Btn>
```

</>;
}

// ════════════════════════════════════════════════
// 設定画面（パスワード管理）
// ════════════════════════════════════════════════
function AConfig({adminPw, setAdminPw, cutoff, setCutoff, msg}) {
const newPwRef  = useRef(””);
const confRef   = useRef(””);
const oldPwRef  = useRef(””);
const [pwMode, setPwMode] = useState(adminPw ? “change” : “set”);
const [localCutoff, setLocalCutoff] = useState(cutoff);
const [confirmRemove, setConfirmRemove] = useState(false);

const CUTOFF_OPTIONS = [
{v:0,   l:“制限なし（直前まで予約可）”},
{v:15,  l:“15分前まで”},
{v:30,  l:“30分前まで”},
{v:60,  l:“1時間前まで”},
{v:120, l:“2時間前まで”},
{v:180, l:“3時間前まで”},
{v:360, l:“6時間前まで”},
{v:720, l:“12時間前まで”},
{v:1440,l:“前日まで（当日予約不可）”},
];

const setNew = () => {
const np = newPwRef.current.trim();
const cp = confRef.current.trim();
if (!np)        { msg(“パスワードを入力してください”,“error”); return; }
if (np !== cp)  { msg(“確認用パスワードが一致しません”,“error”); return; }
if (np.length < 4) { msg(“4文字以上で設定してください”,“error”); return; }
setAdminPw(np);
newPwRef.current = “”; confRef.current = “”;
msg(“パスワードを設定しました”,“success”);
setPwMode(“change”);
};

const change = () => {
const op = oldPwRef.current.trim();
const np = newPwRef.current.trim();
const cp = confRef.current.trim();
if (op !== adminPw) { msg(“現在のパスワードが違います”,“error”); return; }
if (!np)            { msg(“新しいパスワードを入力してください”,“error”); return; }
if (np !== cp)      { msg(“確認用パスワードが一致しません”,“error”); return; }
if (np.length < 4)  { msg(“4文字以上で設定してください”,“error”); return; }
setAdminPw(np);
oldPwRef.current = “”; newPwRef.current = “”; confRef.current = “”;
msg(“パスワードを変更しました”,“success”);
};

const remove = () => {
if (oldPwRef.current.trim() !== adminPw) { msg(“現在のパスワードが違います”,“error”); return; }
setConfirmRemove(true);
};
const doRemove = () => {
setAdminPw(””); oldPwRef.current = “”;
msg(“パスワードを解除しました”); setPwMode(“set”); setConfirmRemove(false);
};

return <>
<div style={{fontSize:16,fontWeight:700,marginBottom:16,color:C}}>⚙️ 設定</div>

```
{/* 予約締切設定 */}
<Card>
  <div style={{fontWeight:700,color:C,marginBottom:4,fontSize:13}}>⏰ 予約締切時間</div>
  <div style={{fontSize:12,color:"#9a8070",marginBottom:14,lineHeight:1.7}}>
    患者様がオンラインで予約できる締切時間を設定します。<br/>
    過ぎた時間枠は予約フォームに表示されなくなります。
  </div>
  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
    {CUTOFF_OPTIONS.map(o=>(
      <button key={o.v} onClick={()=>setLocalCutoff(o.v)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:`2px solid ${localCutoff===o.v?C:"#d6cdc4"}`,borderRadius:8,background:localCutoff===o.v?"#f5ede2":"white",cursor:"pointer",textAlign:"left"}}>
        <div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${localCutoff===o.v?C:"#ccc"}`,background:localCutoff===o.v?C:"white",flexShrink:0}}/>
        <span style={{fontSize:13,color:localCutoff===o.v?C:"#2d1f14",fontWeight:localCutoff===o.v?700:400}}>{o.l}</span>
      </button>
    ))}
  </div>
  <Btn full bg="#4a7c59" onClick={()=>{setCutoff(localCutoff);msg("予約締切時間を保存しました","success");}}>保存する</Btn>
</Card>

{/* パスワード設定 */}
<Card>
  <div style={{fontWeight:700,color:C,marginBottom:4,fontSize:13}}>🔐 管理者パスワード</div>
  <div style={{fontSize:12,color:"#9a8070",marginBottom:16,lineHeight:1.7}}>
    {adminPw
      ? "パスワードが設定されています。管理者画面を開く際にログインが必要です。"
      : "パスワードが設定されていません。設定すると管理者画面にログインが必要になります。"}
  </div>

  {pwMode === "set" && <>
    <Fld label="新しいパスワード（4文字以上）" req>
      <input type="password" defaultValue="" onChange={e=>{newPwRef.current=e.target.value;}} placeholder="••••••" style={IS}/>
    </Fld>
    <Fld label="確認用パスワード" req>
      <input type="password" defaultValue="" onChange={e=>{confRef.current=e.target.value;}} placeholder="••••••" style={IS}/>
    </Fld>
    <Btn full bg="#4a7c59" onClick={setNew}>パスワードを設定する</Btn>
  </>}

  {pwMode === "change" && <>
    <Fld label="現在のパスワード" req>
      <input type="password" defaultValue="" onChange={e=>{oldPwRef.current=e.target.value;}} placeholder="••••••" style={IS}/>
    </Fld>
    <Fld label="新しいパスワード（4文字以上）" req>
      <input type="password" defaultValue="" onChange={e=>{newPwRef.current=e.target.value;}} placeholder="••••••" style={IS}/>
    </Fld>
    <Fld label="確認用パスワード" req>
      <input type="password" defaultValue="" onChange={e=>{confRef.current=e.target.value;}} placeholder="••••••" style={IS}/>
    </Fld>
    <div style={{display:"flex",gap:10}}>
      <Btn full bg="#4a7c59" onClick={change}>パスワードを変更する</Btn>
      <Btn bg="#b03030" onClick={remove}>解除</Btn>
    </div>
  </>}
</Card>

<Card>
  <div style={{fontWeight:700,color:C,marginBottom:12,fontSize:13}}>📊 データ情報</div>
  <div style={{fontSize:13,color:"#7a6050",lineHeight:2}}>
    データはこのブラウザに保存されています。<br/>
    ブラウザのキャッシュを削除するとデータが失われます。
  </div>
</Card>

<ConfirmDialog
  open={confirmRemove}
  message="パスワードを解除しますか？&#10;解除するとログインが不要になります。"
  okLabel="解除する"
  okColor="#b03030"
  onOk={doRemove}
  onCancel={()=>setConfirmRemove(false)}
/>
```

</>;
}
