import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, query, where,
  addDoc, updateDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Callable administration functions use the deployed asia-south1 Functions endpoint.
// This avoids routing production user administration through a partial local emulator.
const functions = getFunctions(app, "asia-south1");

const $ = (id) => document.getElementById(id);
const loginBox = $("loginBox"), appShell = $("appShell"), loginForm = $("loginForm");
const loginButton = $("loginButton"), message = $("message"), pageContent = $("pageContent");
const modalRoot = $("modalRoot");

const MANDALS = [
  "BALIJIPETA","BHAMINI","G.L.PURAM","GARUGUBILLI","JIYYAMMAVALASA",
  "KOMARADA","KURUPAM","MAKKUVA","PACHIPENTA","PALAKONDA",
  "PARVATHIPURAM","SALURU","SEETHAMPETA","SEETHANAGARAM","VEERAGHATTAM"
];
const FITNESS_FIELDS = [
  ["heightCm","Height (cm)","cm"],
  ["weightKg","Weight (kg)","kg"],
  ["run50mSec","50m Run (seconds)","sec"],
  ["run600mSec","600m Run (seconds)","sec"],
  ["standingBroadJumpCm","Standing Broad Jump (cm)","cm"],
  ["sitAndReachCm","Sit and Reach (cm)","cm"],
  ["shuttleRunSec","Shuttle Run (seconds)","sec"]
];
const state = { user:null, profile:null, view:"overview", schools:[], students:[], tests:[], users:[], loaded:{}, selectedSchool:"", search:"" };
const esc = (v="") => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const role = () => String(state.profile?.role || "").toUpperCase();
const isDEO = () => role()==="DEO";
const isMEO = () => role()==="MEO";
const isSchoolUser = () => ["PD","PET"].includes(role());
const assignedSchool = () => state.profile?.schoolUdise || "";
const assignedMandal = () => state.profile?.mandal || "";
const fmt = (n) => Number(n||0).toLocaleString("en-IN");
const today = () => new Date().toISOString().slice(0,10);
function showLoginError(text){ message.textContent=text; }
function setLoginBusy(busy){loginButton.disabled=busy;loginButton.textContent=busy?"PLEASE WAIT...":"LOGIN";}
function profilePath(uid){return doc(db,"users",uid);}
function setPageTitle(title){$("pageTitle").textContent=title;}
function empty(text){return `<div class="empty">${esc(text)}</div>`;}
function card(title,body,extra=""){return `<section class="card ${extra}"><div class="section-head"><h3>${title}</h3></div>${body}</section>`;}
function stat(label,value,note,icon){return `<div class="card"><div class="stat-label">${icon||"●"} &nbsp;${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-note">${esc(note||"")}</div></div>`;}
function showError(err){console.error(err);return err?.message || "Something went wrong. Please try again.";}

async function fetchSchools(){
  let q;
  if(isDEO()) q=collection(db,"schools");
  else if(isMEO()) q=query(collection(db,"schools"),where("mandal","==",assignedMandal()));
  else q=query(collection(db,"schools"),where("udise","==",assignedSchool()));
  const snap=await getDocs(q);
  state.schools=snap.docs.map(d=>({id:d.id,...d.data()}));
  state.loaded.schools=true;
  return state.schools;
}
function scopedQuery(collectionName){
  const ref=collection(db,collectionName);
  if(isDEO()) return ref;
  if(isMEO()) return query(ref,where("mandal","==",assignedMandal()));
  return query(ref,where("schoolUdise","==",assignedSchool()),where("mandal","==",assignedMandal()));
}
async function fetchStudents(force=false){
  if(state.loaded.students&&!force)return state.students;
  const snap=await getDocs(scopedQuery("students"));
  state.students=snap.docs.map(d=>({id:d.id,...d.data()}));
  state.loaded.students=true;return state.students;
}
async function fetchTests(force=false){
  if(state.loaded.tests&&!force)return state.tests;
  const snap=await getDocs(scopedQuery("fitnessTests"));
  state.tests=snap.docs.map(d=>({id:d.id,...d.data()}));
  state.tests.sort((a,b)=>String(b.testDate||"").localeCompare(String(a.testDate||"")));
  state.loaded.tests=true;return state.tests;
}
async function fetchUsers(force=false){
  if(!isDEO())return [];
  if(state.loaded.users&&!force)return state.users;
  const snap=await getDocs(collection(db,"users"));
  state.users=snap.docs.map(d=>({id:d.id,...d.data()}));
  state.loaded.users=true;return state.users;
}
async function ensureSchools(){if(!state.loaded.schools)await fetchSchools();}
function scopedMandals(){
  if(isDEO())return MANDALS;
  if(isMEO())return [assignedMandal()];
  const s=state.schools.find(x=>x.udise===assignedSchool());
  return s?[s.mandal]:[];
}

function renderOverview(){
  const schoolCount=state.schools.length;
  const studentCount=state.students.length;
  const testCount=state.tests.length;
  const mandals=scopedMandals();
  const testedStudents=new Set(state.tests.map(t=>t.studentId)).size;
  const recent=state.tests.slice(0,8);
  pageContent.innerHTML=`
    <div class="welcome"><h1>Welcome, ${esc(state.profile.name||state.profile.displayName||"DEO Admin")}</h1><p>District Sports &amp; Fitness Monitoring · Parvathipuram Manyam District</p></div>
    <div class="grid stats">
      ${stat("Mandals",isDEO()?"15":mandals.length,"District coverage","⌖")}
      ${stat("Schools",fmt(schoolCount),isDEO()?"Imported school master": "Schools in your assigned area","⌂")}
      ${stat("Students Registered",fmt(studentCount),"Student records entered","♧")}
      ${stat("Fitness Assessments",fmt(testCount),`${fmt(testedStudents)} students assessed`,"✚")}
    </div>
    <div class="grid two-col">
      ${card("Mandal-wise School Coverage",`<div class="mandal-grid grid">${mandals.map(m=>{const n=state.schools.filter(s=>s.mandal===m).length;return `<div class="card"><h4>${esc(m)}</h4><div class="metric-line"><span>Schools</span><strong>${n}</strong></div><div class="bar"><span style="width:${schoolCount?Math.round(n/Math.max(...mandals.map(x=>state.schools.filter(s=>s.mandal===x).length),1)*100):0}%"></span></div></div>`}).join("")}</div>`)}
      ${card("Latest Fitness Assessments",recent.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>School</th><th>Date</th><th>BMI</th></tr></thead><tbody>${recent.map(t=>`<tr><td>${esc(t.studentName)}</td><td>${esc(t.schoolName)}</td><td>${esc(t.testDate)}</td><td>${esc(t.bmi??"—")}</td></tr>`).join("")}</tbody></table></div>`:empty("No fitness assessments entered yet."))}
    </div>
    <p class="footer-note">Counts are based on records currently stored in Firestore. Student and fitness totals remain zero until records are entered.</p>`;
}

function renderMandals(){
  const mandals=scopedMandals();
  pageContent.innerHTML=`<div class="welcome"><h1>Mandal Monitoring</h1><p>School coverage and fitness activity by mandal.</p></div>
    <div class="grid mandal-grid">${mandals.map(m=>{
      const schools=state.schools.filter(s=>s.mandal===m);
      const students=state.students.filter(s=>s.mandal===m);
      const tests=state.tests.filter(t=>t.mandal===m);
      const pct=students.length?Math.min(100,Math.round(new Set(tests.map(t=>t.studentId)).size/students.length*100)):0;
      return `<div class="card mandal-card"><h4>${esc(m)}</h4><div class="metric-line"><span>Schools</span><strong>${fmt(schools.length)}</strong></div><div class="metric-line"><span>Students</span><strong>${fmt(students.length)}</strong></div><div class="metric-line"><span>Assessments</span><strong>${fmt(tests.length)}</strong></div><div class="metric-line"><span>Students assessed</span><strong>${pct}%</strong></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
    }).join("")}</div>`;
}

function renderSchools(){
  const term=state.search.toLowerCase();
  const rows=state.schools.filter(s=>`${s.name} ${s.udise} ${s.mandal}`.toLowerCase().includes(term));
  pageContent.innerHTML=`<div class="welcome"><h1>School Management</h1><p>Master list of schools available to your account.</p></div>
    <div class="toolbar"><input id="schoolSearch" placeholder="Search school, UDISE or mandal" value="${esc(state.search)}"><span class="pill">${rows.length} schools</span></div>
    <div class="table-wrap"><table><thead><tr><th>UDISE Code</th><th>School Name</th><th>Mandal</th><th>Mandal Code</th><th>Students</th><th>Fitness Tests</th></tr></thead><tbody>
    ${rows.map(s=>`<tr><td>${esc(s.udise)}</td><td>${esc(s.name)}</td><td>${esc(s.mandal)}</td><td>${esc(s.mandalCode)}</td><td>${fmt(state.students.filter(x=>x.schoolUdise===s.udise).length)}</td><td>${fmt(state.tests.filter(x=>x.schoolUdise===s.udise).length)}</td></tr>`).join("")||`<tr><td colspan="6">${empty("No schools match your search.")}</td></tr>`}
    </tbody></table></div>`;
  $("schoolSearch").addEventListener("input",e=>{state.search=e.target.value;renderSchools();const el=$("schoolSearch");el.focus();el.setSelectionRange(el.value.length,el.value.length);});
}

function renderUsers(){
  const rows=state.users;
  pageContent.innerHTML=`<div class="welcome"><h1>User Management</h1><p>Create and manage MEO, PD and PET accounts. Account creation is performed securely by Cloud Functions.</p></div>
    <div class="notice">New accounts are created with an active Firestore profile. Share initial passwords securely with the respective staff member and ask them to change it through the approved account-recovery process.</div>
    <div class="toolbar"><button class="btn" id="addUserBtn">＋ Create User</button><span class="pill">${rows.length} profiles</span></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Mandal</th><th>School</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${rows.map(u=>`<tr><td>${esc(u.name||u.displayName||"—")}</td><td>${esc(u.email||"—")}</td><td><span class="pill">${esc(u.role||"—")}</span></td><td>${esc(u.mandal||"—")}</td><td>${esc(u.schoolName||u.schoolUdise||"—")}</td><td><span class="pill ${u.active===true?"green":"red"}">${u.active===true?"Active":"Inactive"}</span></td><td>${u.id===state.user.uid?'<span class="muted">Current user</span>':`<button class="btn btn-small ${u.active===true?"btn-danger":"btn-success"}" data-toggle-user="${esc(u.id)}" data-active="${u.active===true?"true":"false"}">${u.active===true?"Deactivate":"Activate"}</button>`}</td></tr>`).join("")||`<tr><td colspan="7">${empty("No user profiles found.")}</td></tr>`}
    </tbody></table></div>`;
  $("addUserBtn").addEventListener("click",openUserModal);
  pageContent.querySelectorAll("[data-toggle-user]").forEach(btn=>btn.addEventListener("click",()=>toggleUser(btn.dataset.toggleUser,btn.dataset.active!=="true")));
}

function openUserModal(){
  const schoolOptions=state.schools.map(s=>`<option value="${esc(s.udise)}" data-mandal="${esc(s.mandal)}" data-name="${esc(s.name)}">${esc(s.name)} — ${esc(s.mandal)} (${esc(s.udise)})</option>`).join("");
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><h3>Create Staff Account</h3><button class="btn btn-light btn-small" id="closeModal">Close</button></div>
    <form id="userForm"><div class="form-grid">
      <div class="field"><label>Full Name *</label><input name="displayName" required></div>
      <div class="field"><label>Email *</label><input name="email" type="email" required></div>
      <div class="field"><label>Temporary Password * (minimum 8 characters)</label><input name="password" type="password" minlength="8" required></div>
      <div class="field"><label>Role *</label><select name="role" id="newUserRole"><option value="MEO">MEO</option><option value="PD">PD</option><option value="PET">PET</option></select></div>
      <div class="field" id="userMandalField"><label>Mandal *</label><select name="mandal" id="newUserMandal">${MANDALS.map(m=>`<option>${esc(m)}</option>`).join("")}</select></div>
      <div class="field hidden" id="userSchoolField"><label>Assigned School *</label><select name="schoolUdise" id="newUserSchool"><option value="">Select school</option>${schoolOptions}</select></div>
      <div class="field full"><small class="muted">The selected school determines the mandal and school assignment for PD/PET accounts.</small></div>
    </div><div id="userFormError" class="muted tiny"></div><div class="actions"><button class="btn" type="submit" id="createUserSubmit">Create Account</button></div></form></div></div>`;
  $("closeModal").onclick=()=>modalRoot.innerHTML="";
  const roleSelect=$("newUserRole");
  const updateRole=()=>{const school=roleSelect.value!=="MEO";$("userSchoolField").classList.toggle("hidden",!school);$("newUserMandal").disabled=school;};
  roleSelect.addEventListener("change",updateRole);updateRole();
  $("newUserSchool").addEventListener("change",e=>{const opt=e.target.selectedOptions[0];if(opt?.dataset.mandal)$("newUserMandal").value=opt.dataset.mandal;});
  $("userForm").addEventListener("submit",async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const roleValue=f.get("role");
    const selectedSchool = roleValue === "MEO" ? null : state.schools.find(s => s.udise === String(f.get("schoolUdise")));
    const data={email:String(f.get("email")).trim(),password:String(f.get("password")),displayName:String(f.get("displayName")).trim(),role:roleValue,mandal:roleValue==="MEO"?String(f.get("mandal")):(selectedSchool?.mandal||"")};
    if(roleValue!=="MEO")data.schoolUdise=selectedSchool?.udise||"";
    const submit=$("createUserSubmit");submit.disabled=true;submit.textContent="Creating...";
    try{const fn=httpsCallable(functions,"createManagedUser");await fn(data);modalRoot.innerHTML="";state.loaded.users=false;await fetchUsers(true);renderUsers();alert("User account created successfully.");}
    catch(err){$("userFormError").textContent=showError(err);submit.disabled=false;submit.textContent="Create Account";}
  });
}

async function toggleUser(uid,active){
  if(!confirm(`${active?"Deactivate":"Activate"} this account?`))return;
  try{const fn=httpsCallable(functions,"setManagedUserStatus");await fn({uid,active});state.loaded.users=false;await fetchUsers(true);renderUsers();}
  catch(err){alert(showError(err));}
}

function renderStudents(){
  const rows=state.students;
  pageContent.innerHTML=`<div class="welcome"><h1>Student Management</h1><p>Register students against the imported school master. Enter only verified student details.</p></div>
    <div class="toolbar"><input id="studentSearch" placeholder="Search student name, PEN, UDISE or school" value="${esc(state.search)}">${!isMEO()?'<button class="btn" id="addStudentBtn">＋ Register Student</button>':''}<span class="pill">${rows.length} students</span></div>
    <div class="table-wrap"><table><thead><tr><th>Student Name</th><th>PEN</th><th>Class</th><th>Gender</th><th>School</th><th>Mandal</th><th>Status</th></tr></thead><tbody>
    ${rows.filter(s=>`${s.name} ${s.pen} ${s.schoolName} ${s.schoolUdise}`.toLowerCase().includes(state.search.toLowerCase())).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.pen||"—")}</td><td>${esc(s.className||"—")}</td><td>${esc(s.gender||"—")}</td><td>${esc(s.schoolName||s.schoolUdise)}</td><td>${esc(s.mandal)}</td><td><span class="pill ${s.active===false?"red":"green"}">${s.active===false?"Inactive":"Active"}</span></td></tr>`).join("")||`<tr><td colspan="7">${empty("No student records found. Register students to begin.")}</td></tr>`}
    </tbody></table></div>`;
  $("studentSearch").addEventListener("input",e=>{state.search=e.target.value;renderStudents();const el=$("studentSearch");el.focus();el.setSelectionRange(el.value.length,el.value.length);});
  if($("addStudentBtn")) $("addStudentBtn").addEventListener("click",openStudentModal);
}

function openStudentModal(){
  const schools=state.schools;
  const options=schools.map(s=>`<option value="${esc(s.udise)}">${esc(s.name)} — ${esc(s.mandal)}</option>`).join("");
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><h3>Register Student</h3><button class="btn btn-light btn-small" id="closeModal">Close</button></div>
    <form id="studentForm"><div class="form-grid">
      <div class="field"><label>Student Full Name *</label><input name="name" required></div>
      <div class="field"><label>PEN / Student ID</label><input name="pen"></div>
      <div class="field"><label>Class *</label><select name="className" required>${[6,7,8,9,10].map(c=>`<option value="${c}">Class ${c}</option>`).join("")}</select></div>
      <div class="field"><label>Gender</label><select name="gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
      <div class="field"><label>School *</label><select name="schoolUdise" id="studentSchool" required>${options}</select></div>
      <div class="field"><label>Date of Birth</label><input type="date" name="dob"></div>
    </div><div id="studentFormError" class="muted tiny"></div><div class="actions"><button class="btn" id="saveStudentBtn">Save Student</button></div></form></div></div>`;
  $("closeModal").onclick=()=>modalRoot.innerHTML="";
  $("studentForm").addEventListener("submit",async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const school=schools.find(s=>s.udise===f.get("schoolUdise"));
    if(!school){$("studentFormError").textContent="Please select a valid school.";return;}
    const payload={name:String(f.get("name")).trim(),pen:String(f.get("pen")||"").trim(),className:String(f.get("className")),gender:String(f.get("gender")||""),dob:String(f.get("dob")||""),schoolUdise:school.udise,schoolName:school.name,mandal:school.mandal,mandalCode:school.mandalCode,active:true,createdAt:serverTimestamp(),createdBy:state.user.uid};
    const btn=$("saveStudentBtn");btn.disabled=true;btn.textContent="Saving...";
    try{await addDoc(collection(db,"students"),payload);modalRoot.innerHTML="";state.loaded.students=false;await fetchStudents(true);renderStudents();}
    catch(err){$("studentFormError").textContent=showError(err);btn.disabled=false;btn.textContent="Save Student";}
  });
}

function fitnessValue(value){return value===null||value===undefined||value===""?"—":esc(value);}
function fitnessPayload(student, values, testDate, remarks=""){
  const payload={
    studentId:student.id,studentName:student.name,pen:student.pen||"",
    className:student.className,gender:student.gender||"",
    schoolUdise:student.schoolUdise,schoolName:student.schoolName,
    mandal:student.mandal,mandalCode:student.mandalCode,
    testDate,remarks,createdAt:serverTimestamp(),createdBy:state.user.uid
  };
  for(const [key] of FITNESS_FIELDS){
    const raw=values[key];
    payload[key]=raw===null||raw===undefined||String(raw).trim()===""?null:Number(raw);
    if(payload[key]!==null&&(!Number.isFinite(payload[key])||payload[key]<0))throw new Error(`Invalid value for ${key}.`);
  }
  payload.bmi=payload.heightCm>0&&payload.weightKg>0
    ?Number((payload.weightKg/((payload.heightCm/100)**2)).toFixed(2)):null;
  return payload;
}
function renderFitness(){
  const recent=state.tests.slice(0,50);
  const canEnter=isDEO()||isSchoolUser();
  pageContent.innerHTML=`
    <div class="welcome"><h1>Fitness Data Entry</h1><p>Individual assessment entry and Excel bulk upload for the Khelo India fitness parameters.</p></div>
    <div class="notice">Enter measured values only. Height is in centimetres, weight in kilograms, jumps/reach in centimetres, and running times in seconds. BMI is calculated automatically from height and weight.</div>
    <div class="toolbar">
      ${canEnter?'<button class="btn" id="newFitnessBtn">＋ Individual Entry</button><button class="btn btn-light" id="downloadFitnessTemplate">Download Excel Template</button><button class="btn btn-light" id="bulkFitnessBtn">Upload Excel / CSV</button><input id="fitnessFile" type="file" accept=".xlsx,.xls,.csv" class="hidden">':''}
      <input id="fitnessSearch" placeholder="Search student, PEN, school or UDISE" value="${esc(state.search)}">
      <span class="pill">${state.tests.length} assessment records</span>
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Student</th><th>PEN</th><th>Class</th><th>School</th><th>Mandal</th><th>Date</th><th>Height cm</th><th>Weight kg</th><th>BMI</th><th>50m sec</th><th>600m sec</th><th>Broad Jump cm</th><th>Sit & Reach cm</th><th>Shuttle sec</th>
    </tr></thead><tbody>${recent.filter(t=>`${t.studentName} ${t.pen} ${t.schoolName} ${t.schoolUdise} ${t.mandal}`.toLowerCase().includes(state.search.toLowerCase())).map(t=>`<tr>
      <td>${esc(t.studentName)}</td><td>${esc(t.pen||"—")}</td><td>${esc(t.className||"—")}</td><td>${esc(t.schoolName||"—")}</td><td>${esc(t.mandal||"—")}</td><td>${esc(t.testDate||"—")}</td>
      <td>${fitnessValue(t.heightCm)}</td><td>${fitnessValue(t.weightKg)}</td><td>${fitnessValue(t.bmi)}</td><td>${fitnessValue(t.run50mSec)}</td><td>${fitnessValue(t.run600mSec)}</td><td>${fitnessValue(t.standingBroadJumpCm)}</td><td>${fitnessValue(t.sitAndReachCm)}</td><td>${fitnessValue(t.shuttleRunSec)}</td>
    </tr>`).join("")||`<tr><td colspan="14">${empty("No fitness assessments found. Register students and enter assessments to begin.")}</td></tr>`}</tbody></table></div>
    <p class="footer-note">Showing the latest 50 records. Use Reports &amp; Export to download the complete set of records accessible to your account.</p>`;
  if($("newFitnessBtn"))$("newFitnessBtn").onclick=()=>openFitnessModal(state.students);
  if($("downloadFitnessTemplate"))$("downloadFitnessTemplate").onclick=downloadFitnessTemplate;
  if($("bulkFitnessBtn"))$("bulkFitnessBtn").onclick=()=>$ ("fitnessFile").click();
  if($("fitnessFile"))$("fitnessFile").addEventListener("change",handleFitnessFile);
  if($("fitnessSearch"))$("fitnessSearch").addEventListener("input",e=>{state.search=e.target.value;renderFitness();const el=$("fitnessSearch");el.focus();el.setSelectionRange(el.value.length,el.value.length);});
}
function downloadFitnessTemplate(){
  const headers=["studentId","pen","schoolUdise","testDate","heightCm","weightKg","run50mSec","run600mSec","standingBroadJumpCm","sitAndReachCm","shuttleRunSec","remarks"];
  const example=["","STUDENT_PEN","SCHOOL_UDISE",today(),150,42,9.5,210,165,12,14.2,""];
  const ws=XLSX.utils.aoa_to_sheet([headers,example]);
  ws["!cols"]=headers.map(h=>({wch:Math.max(14,h.length+2)}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Fitness Upload");
  XLSX.writeFile(wb,"Khelo_Manyam_Fitness_Upload_Template.xlsx");
}
async function handleFitnessFile(event){
  const file=event.target.files?.[0];if(!file)return;
  const input=event.target;input.value="";
  try{
    if(!window.XLSX)throw new Error("Excel reader did not load. Refresh the page and try again.");
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{type:"array",cellDates:false});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:false});
    if(!rows.length)throw new Error("The selected file has no data rows.");
    const students=state.students;
    const prepared=[];const errors=[];
    rows.forEach((row,index)=>{
      const line=index+2;
      const udise=String(row.schoolUdise||"").trim();
      const pen=String(row.pen||"").trim();
      const studentId=String(row.studentId||"").trim();
      let matches=students.filter(s=>studentId?s.id===studentId:(udise&&pen&&String(s.schoolUdise)===udise&&String(s.pen||"")===pen));
      if(matches.length!==1){errors.push(`Row ${line}: student not uniquely matched. Supply studentId, or both pen and schoolUdise.`);return;}
      const student=matches[0];
      const rawDate=String(row.testDate||today()).trim();
      const testDate=rawDate;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(testDate)){errors.push(`Row ${line}: testDate must be YYYY-MM-DD.`);return;}
      try{
        const values={};for(const [key] of FITNESS_FIELDS)values[key]=row[key]===undefined||row[key]===""?null:row[key];
        if(FITNESS_FIELDS.every(([key])=>values[key]===null))throw new Error("at least one fitness measurement is required");
        prepared.push(fitnessPayload(student,values,testDate,String(row.remarks||"").trim()));
      }catch(err){errors.push(`Row ${line}: ${err.message}`);}
    });
    if(errors.length)throw new Error(`Upload stopped. ${errors.slice(0,12).join(" | ")}${errors.length>12?` | and ${errors.length-12} more errors`:""}`);
    if(!prepared.length)throw new Error("No valid assessment rows were found.");
    if(!confirm(`Import ${prepared.length} fitness assessment(s) into Firestore?`))return;
    let count=0;
    for(let i=0;i<prepared.length;i+=450){
      const batch=writeBatch(db);
      prepared.slice(i,i+450).forEach(payload=>batch.set(doc(collection(db,"fitnessTests")),payload));
      await batch.commit();count+=Math.min(450,prepared.length-i);
    }
    state.loaded.tests=false;await fetchTests(true);renderFitness();alert(`Successfully imported ${count} fitness assessment(s).`);
  }catch(err){alert(showError(err));}
}
function openFitnessModal(students){
  if(!students.length){alert("Register students before entering fitness assessments.");return;}
  const available=isSchoolUser()?students.filter(s=>s.schoolUdise===assignedSchool()):students;
  if(!available.length){alert("No students are available for your assigned school.");return;}
  const opts=available.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} — ${esc(s.schoolName)} (${esc(s.className)})</option>`).join("");
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-top"><h3>Individual Fitness Assessment</h3><button type="button" class="btn btn-light btn-small" id="closeModal">Close</button></div>
    <form id="fitnessForm"><div class="form-grid">
      <div class="field full"><label>Student *</label><select name="studentId" required>${opts}</select></div>
      <div class="field"><label>Assessment Date *</label><input name="testDate" type="date" value="${today()}" required></div>
      ${FITNESS_FIELDS.map(([key,label])=>`<div class="field"><label>${esc(label)}</label><input name="${key}" type="number" min="0" step="0.01" inputmode="decimal"></div>`).join("")}
      <div class="field full"><label>Remarks</label><textarea name="remarks" rows="2" maxlength="1000"></textarea></div>
    </div><div id="fitnessBMI" class="notice">BMI will be calculated when both height and weight are entered.</div><div id="fitnessFormError" class="notice hidden"></div><div class="actions"><button type="submit" class="btn" id="saveFitnessBtn">Save Assessment</button></div></form></div></div>`;
  $("closeModal").onclick=()=>modalRoot.innerHTML="";
  const form=$("fitnessForm");
  const calc=()=>{const h=Number(form.elements.heightCm.value),w=Number(form.elements.weightKg.value);$("fitnessBMI").textContent=h>0&&w>0?`Calculated BMI: ${(w/((h/100)**2)).toFixed(2)}`:"BMI will be calculated when both height and weight are entered.";};
  form.elements.heightCm.addEventListener("input",calc);form.elements.weightKg.addEventListener("input",calc);
  form.addEventListener("submit",async e=>{
    e.preventDefault();const f=new FormData(form);const student=available.find(s=>s.id===f.get("studentId"));
    const btn=$("saveFitnessBtn"),err=$("fitnessFormError");btn.disabled=true;btn.textContent="Saving...";err.classList.add("hidden");
    try{
      if(!student)throw new Error("Student not found in your permitted school scope.");
      const values={};for(const [key] of FITNESS_FIELDS)values[key]=f.get(key);
      if(FITNESS_FIELDS.every(([key])=>values[key]===""))throw new Error("Enter at least one fitness measurement.");
      const payload=fitnessPayload(student,values,String(f.get("testDate")),String(f.get("remarks")||"").trim());
      await addDoc(collection(db,"fitnessTests"),payload);
      modalRoot.innerHTML="";state.loaded.tests=false;await fetchTests(true);renderFitness();
    }catch(error){err.textContent=showError(error);err.classList.remove("hidden");btn.disabled=false;btn.textContent="Save Assessment";}
  });
}

function renderAnalytics(){
  const tests=state.tests;
  const mandals=scopedMandals();
  const counts=mandals.map(m=>({name:m,count:tests.filter(t=>t.mandal===m).length}));
  const max=Math.max(1,...counts.map(x=>x.count));
  const avgBMI=tests.filter(t=>Number(t.bmi)>0);
  const bmiAvg=avgBMI.length?(avgBMI.reduce((a,b)=>a+Number(b.bmi),0)/avgBMI.length).toFixed(2):"—";
  const genderCounts=["Male","Female","Other"].map(g=>({name:g,count:tests.filter(t=>String(t.gender).toLowerCase()===g.toLowerCase()).length}));
  pageContent.innerHTML=`<div class="welcome"><h1>Fitness Analytics</h1><p>Analysis of recorded fitness assessments. Blank measures are excluded from averages.</p></div>
    <div class="grid stats">${stat("Assessments",fmt(tests.length),"All available records","✚")}${stat("Students Assessed",fmt(new Set(tests.map(t=>t.studentId)).size),"Unique student IDs","♧")}${stat("Average BMI",bmiAvg,"Among records with valid height and weight","◉")}${stat("Schools Covered",fmt(new Set(tests.map(t=>t.schoolUdise)).size),"Schools with at least one assessment","⌂")}</div>
    ${card("Assessments by Mandal",counts.map(x=>`<div class="chart-row"><span>${esc(x.name)}</span><div class="chart-track"><span style="width:${x.count/max*100}%"></span></div><strong>${x.count}</strong></div>`).join("")||empty("No data"))}
    <div style="height:14px"></div>${card("Assessments by Gender",genderCounts.map(x=>`<div class="chart-row"><span>${esc(x.name)}</span><div class="chart-track"><span style="width:${tests.length?x.count/tests.length*100:0}%"></span></div><strong>${x.count}</strong></div>`).join(""))}`;
}

function csvDownload(filename,rows){
  if(!rows.length){alert("No records available to export.");return;}
  const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const safeCell=(value)=>{
    const text=String(value??"");
    // Prevent spreadsheet formula injection while retaining ordinary values.
    return /^[=+@\-\t\r]/.test(text)?`'${text}`:text;
  };
  const csv=[headers.join(","),...rows.map(row=>headers.map(h=>`"${safeCell(row[h]).replace(/"/g,'""')}"`).join(","))].join("\r\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const REPORT_FIELDS=[
  ["heightCm","Height (cm)"],["weightKg","Weight (kg)"],["bmi","BMI"],
  ["run50mSec","50m Run (sec)"],["run600mSec","600m Run (sec)"],
  ["standingBroadJumpCm","Standing Broad Jump (cm)"],
  ["sitAndReachCm","Sit and Reach (cm)"],["shuttleRunSec","Shuttle Run (sec)"]
];
function reportFilters(){
  const val=id=>$(id)?.value||"";
  const from=val("reportFrom"),to=val("reportTo"),mandal=val("reportMandal"),school=val("reportSchool"),className=val("reportClass"),gender=val("reportGender");
  return {from,to,mandal,school,className,gender};
}
function applyReportFilters(filters=reportFilters()){
  const schoolByUdise=new Map(state.schools.map(s=>[String(s.udise),s]));
  const matchesCommon=row=>{
    const schoolUdise=String(row.schoolUdise||"");
    const schoolRecord=schoolByUdise.get(schoolUdise);
    const rowMandal=String(row.mandal||schoolRecord?.mandal||"");
    if(filters.mandal&&rowMandal!==filters.mandal)return false;
    if(filters.school&&schoolUdise!==filters.school)return false;
    if(filters.className&&String(row.className||"")!==filters.className)return false;
    if(filters.gender&&String(row.gender||"").toLowerCase()!==filters.gender.toLowerCase())return false;
    return true;
  };
  const tests=state.tests.filter(t=>matchesCommon(t)&&(!filters.from||String(t.testDate||"")>=filters.from)&&(!filters.to||String(t.testDate||"")<=filters.to));
  const students=state.students.filter(matchesCommon);
  const schools=state.schools.filter(s=>(!filters.mandal||s.mandal===filters.mandal)&&(!filters.school||String(s.udise)===filters.school));
  return {tests,students,schools};
}
function average(rows,key){
  const values=rows.map(r=>Number(r[key])).filter(n=>Number.isFinite(n)&&n>0);
  return values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)):"";
}
function buildReportData(filtered){
  const {tests,students,schools}=filtered;
  const uniqueAssessed=new Set(tests.map(t=>t.studentId).filter(Boolean)).size;
  const mandals=[...new Set([...schools.map(s=>s.mandal),...students.map(s=>s.mandal),...tests.map(t=>t.mandal)].filter(Boolean))].sort();
  const mandalRows=mandals.map(m=>{
    const ss=schools.filter(s=>s.mandal===m),st=students.filter(s=>s.mandal===m),tt=tests.filter(t=>t.mandal===m);
    return {Mandal:m,Schools:ss.length,Registered_Students:st.length,Assessments:tt.length,Unique_Students_Assessed:new Set(tt.map(t=>t.studentId).filter(Boolean)).size,Coverage_Percent:st.length?Number((new Set(tt.map(t=>t.studentId).filter(Boolean)).size/st.length*100).toFixed(2)):0,Average_BMI:average(tt,"bmi")};
  });
  const schoolRows=schools.map(s=>{
    const st=students.filter(x=>x.schoolUdise===s.udise),tt=tests.filter(x=>x.schoolUdise===s.udise);
    return {UDISE:s.udise,School:s.name,Mandal:s.mandal,Registered_Students:st.length,Assessments:tt.length,Unique_Students_Assessed:new Set(tt.map(t=>t.studentId).filter(Boolean)).size,Coverage_Percent:st.length?Number((new Set(tt.map(t=>t.studentId).filter(Boolean)).size/st.length*100).toFixed(2)):0,Average_BMI:average(tt,"bmi")};
  }).sort((a,b)=>b.Coverage_Percent-a.Coverage_Percent||b.Assessments-a.Assessments);
  const genderRows=["Male","Female","Other"].map(g=>({Gender:g,Registered_Students:students.filter(s=>String(s.gender||"").toLowerCase()===g.toLowerCase()).length,Assessments:tests.filter(t=>String(t.gender||"").toLowerCase()===g.toLowerCase()).length,Average_BMI:average(tests.filter(t=>String(t.gender||"").toLowerCase()===g.toLowerCase()),"bmi")}));
  const classValues=[...new Set([...students.map(s=>String(s.className||"")),...tests.map(t=>String(t.className||""))].filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  const classRows=classValues.map(c=>({Class:c,Registered_Students:students.filter(s=>String(s.className||"")===c).length,Assessments:tests.filter(t=>String(t.className||"")===c).length,Average_BMI:average(tests.filter(t=>String(t.className||"")===c),"bmi")}));
  const parameterRows=REPORT_FIELDS.map(([key,label])=>({Parameter:label,Records_With_Values:tests.filter(t=>Number.isFinite(Number(t[key]))&&t[key]!==null&&t[key]!=="").length,Average:average(tests,key)}));
  const summary=[
    {Metric:"Schools in filtered scope",Value:schools.length},
    {Metric:"Registered students in filtered scope",Value:students.length},
    {Metric:"Fitness assessment records",Value:tests.length},
    {Metric:"Unique students assessed",Value:uniqueAssessed},
    {Metric:"Assessment coverage (%)",Value:students.length?Number((uniqueAssessed/students.length*100).toFixed(2)):0},
    {Metric:"Average BMI",Value:average(tests,"bmi")},
    {Metric:"Report generated",Value:new Date().toLocaleString("en-IN")},
    {Metric:"Generated for role",Value:role()}
  ];
  const assessmentRows=tests.map(t=>({
    Date:t.testDate||"",Student:t.studentName||"",PEN:t.pen||"",Class:t.className||"",Gender:t.gender||"",
    School:t.schoolName||"",UDISE:t.schoolUdise||"",Mandal:t.mandal||"",
    Height_cm:t.heightCm??"",Weight_kg:t.weightKg??"",BMI:t.bmi??"",
    Run_50m_sec:t.run50mSec??"",Run_600m_sec:t.run600mSec??"",
    Standing_Broad_Jump_cm:t.standingBroadJumpCm??"",Sit_and_Reach_cm:t.sitAndReachCm??"",Shuttle_Run_sec:t.shuttleRunSec??"",Remarks:t.remarks||""
  }));
  const studentRows=students.map(s=>({Student:s.name||"",PEN:s.pen||"",Class:s.className||"",Gender:s.gender||"",DOB:s.dob||"",School:s.schoolName||"",UDISE:s.schoolUdise||"",Mandal:s.mandal||"",Status:s.active===false?"Inactive":"Active"}));
  const schoolMasterRows=schools.map(s=>({UDISE:s.udise||s.id,School:s.name||"",Mandal:s.mandal||"",Mandal_Code:s.mandalCode||""}));
  return {summary,assessmentRows,studentRows,schoolMasterRows,mandalRows,schoolRows,genderRows,classRows,parameterRows};
}
function reportFilterDescription(filters){
  return [filters.from?`From ${filters.from}`:"",filters.to?`To ${filters.to}`:"",filters.mandal||"All Mandals",filters.school?`UDISE ${filters.school}`:"All Schools",filters.className?`Class ${filters.className}`:"All Classes",filters.gender||"All Genders"].filter(Boolean).join(" | ");
}
function downloadReportsExcel(data){
  if(!window.XLSX)throw new Error("Excel library did not load. Refresh the page and try again.");
  const wb=XLSX.utils.book_new();
  const sheets=[
    ["Summary",data.summary],["Fitness Assessments",data.assessmentRows],["Mandal Summary",data.mandalRows],
    ["School Summary",data.schoolRows],["Gender Summary",data.genderRows],["Class Summary",data.classRows],
    ["Parameter Summary",data.parameterRows],["Student Register",data.studentRows],["School Master",data.schoolMasterRows]
  ];
  sheets.forEach(([name,rows])=>{
    const safeRows=rows.length?rows:[{Information:"No records available for this filter."}];
    const ws=XLSX.utils.json_to_sheet(safeRows);
    ws["!autofilter"]={ref:XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"]))};
    ws["!cols"]=Object.keys(safeRows[0]).map(k=>({wch:Math.min(36,Math.max(14,k.length+3))}));
    XLSX.utils.book_append_sheet(wb,ws,name);
  });
  const generated=today().replaceAll("-","");
  XLSX.writeFile(wb,`Khelo_Manyam_Report_${generated}.xlsx`);
}
function downloadReportsPDF(data,filters){
  if(!window.jspdf?.jsPDF)throw new Error("PDF library did not load. Refresh the page and try again.");
  const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  if(typeof pdf.autoTable!=="function")throw new Error("PDF table plugin did not load. Refresh the page and try again.");
  const pageWidth=pdf.internal.pageSize.getWidth();
  pdf.setFont("helvetica","bold");pdf.setFontSize(18);pdf.text("KHELO MANYAM",pageWidth/2,14,{align:"center"});
  pdf.setFontSize(10);pdf.setFont("helvetica","normal");pdf.text("DISTRICT SPORTS & FITNESS MONITORING SYSTEM",pageWidth/2,20,{align:"center"});
  pdf.text("PARVATHIPURAM MANYAM DISTRICT",pageWidth/2,25,{align:"center"});
  pdf.setFont("helvetica","bold");pdf.setFontSize(13);pdf.text("FITNESS PERFORMANCE REPORT",pageWidth/2,34,{align:"center"});
  pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.text(`Academic Year: 2026-27  |  ${reportFilterDescription(filters)}`,14,42);
  pdf.text(`Generated: ${new Date().toLocaleString("en-IN")}  |  Access scope: ${role()}`,14,47);
  pdf.autoTable({startY:53,head:[["Metric","Value"]],body:data.summary.slice(0,6).map(r=>[r.Metric,String(r.Value)]),theme:"grid",styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[18,59,100]}});
  let y=pdf.lastAutoTable.finalY+7;
  const addTable=(title,head,body,opts={})=>{
    if(y>175){pdf.addPage();y=15;}
    pdf.setFont("helvetica","bold");pdf.setFontSize(11);pdf.text(title,14,y);y+=3;
    pdf.autoTable({startY:y,head:[head],body,theme:"grid",styles:{fontSize:7,cellPadding:1.7,overflow:"linebreak"},headStyles:{fillColor:[23,107,155]},...opts});
    y=pdf.lastAutoTable.finalY+8;
  };
  addTable("Mandal-wise Summary",["Mandal","Schools","Students","Assessments","Assessed Students","Coverage %","Avg BMI"],data.mandalRows.map(r=>[r.Mandal,r.Schools,r.Registered_Students,r.Assessments,r.Unique_Students_Assessed,r.Coverage_Percent,r.Average_BMI]));
  addTable("School-wise Summary",["UDISE","School","Mandal","Students","Assessments","Coverage %","Avg BMI"],data.schoolRows.map(r=>[r.UDISE,r.School,r.Mandal,r.Registered_Students,r.Assessments,r.Coverage_Percent,r.Average_BMI]));
  addTable("Fitness Parameter Summary",["Parameter","Records","Average"],data.parameterRows.map(r=>[r.Parameter,r.Records_With_Values,r.Average]));
  addTable("Fitness Assessment Details",["Date","Student","PEN","Class","Gender","School","Mandal","BMI","50m","600m","Jump","Sit&Reach","Shuttle"],data.assessmentRows.map(r=>[r.Date,r.Student,r.PEN,r.Class,r.Gender,r.School,r.Mandal,r.BMI,r.Run_50m_sec,r.Run_600m_sec,r.Standing_Broad_Jump_cm,r.Sit_and_Reach_cm,r.Shuttle_Run_sec]),{styles:{fontSize:5.8,cellPadding:1.2},horizontalPageBreak:true,horizontalPageBreakRepeat:[0]});
  const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setFontSize(7);pdf.setFont("helvetica","normal");pdf.text(`Khelo Manyam | Confidential district report | Page ${i} of ${pages}`,pageWidth-14,pdf.internal.pageSize.getHeight()-7,{align:"right"});}
  pdf.save(`Khelo_Manyam_Fitness_Report_${today()}.pdf`);
}
function renderReports(){
  const schoolOptions=state.schools.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(s=>`<option value="${esc(s.udise)}">${esc(s.name)} — ${esc(s.mandal)} (${esc(s.udise)})</option>`).join("");
  const mandals=scopedMandals();
  pageContent.innerHTML=`<div class="welcome"><h1>Reports &amp; Export</h1><p>Generate filtered PDF reports and multi-sheet Excel workbooks from records accessible to your account.</p></div>
    <div class="notice">Reports use the records returned by your existing Firebase role permissions. DEO can access district data; MEO and PD/PET exports remain limited to their assigned areas. Blank fitness measurements are excluded from averages.</div>
    <section class="card" style="margin-bottom:15px"><div class="section-head"><h3>Report Filters</h3><button class="btn btn-light btn-small" id="resetReportFilters">Reset Filters</button></div>
      <div class="form-grid">
        <div class="field"><label>Assessment Date From</label><input type="date" id="reportFrom"></div>
        <div class="field"><label>Assessment Date To</label><input type="date" id="reportTo"></div>
        <div class="field"><label>Mandal</label><select id="reportMandal"><option value="">All Accessible Mandals</option>${mandals.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("")}</select></div>
        <div class="field"><label>School</label><select id="reportSchool"><option value="">All Accessible Schools</option>${schoolOptions}</select></div>
        <div class="field"><label>Class</label><select id="reportClass"><option value="">All Classes</option>${[6,7,8,9,10].map(c=>`<option value="${c}">Class ${c}</option>`).join("")}</select></div>
        <div class="field"><label>Gender</label><select id="reportGender"><option value="">All Genders</option><option>Male</option><option>Female</option><option>Other</option></select></div>
      </div>
      <div class="actions"><button class="btn" id="applyReportFilters">Apply Filters</button><span class="pill" id="reportRecordCount">${state.tests.length} assessment records loaded</span></div>
    </section>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">
      <div class="card"><h3>District / Mandal / School PDF</h3><p class="muted tiny">Summary KPIs, mandal and school coverage, parameter averages and assessment details.</p><button class="btn" id="exportReportPDF">Download PDF Report</button></div>
      <div class="card"><h3>Complete Excel Workbook</h3><p class="muted tiny">Separate worksheets for summary, assessments, mandals, schools, gender, class, parameters, students and school master.</p><button class="btn btn-success" id="exportReportExcel">Download Excel Workbook</button></div>
      <div class="card"><h3>Quick CSV Exports</h3><p class="muted tiny">Excel-compatible CSV files for individual registers.</p><div class="actions"><button class="btn btn-light btn-small" id="exportSchools">Schools CSV</button><button class="btn btn-light btn-small" id="exportStudents">Students CSV</button><button class="btn btn-light btn-small" id="exportTests">Assessments CSV</button></div></div>
      ${isDEO()?`<div class="card"><h3>DEO User Register</h3><p class="muted tiny">Restricted export of staff account profile fields.</p><button class="btn btn-light" id="exportUsers">Users CSV</button></div>`:""}
    </div>
    <div id="reportPreview" style="margin-top:15px"></div>`;
  const updatePreview=()=>{
    const filtered=applyReportFilters();const data=buildReportData(filtered);
    $("reportRecordCount").textContent=`${filtered.tests.length} assessments · ${filtered.students.length} students · ${filtered.schools.length} schools`;
    $("reportPreview").innerHTML=`<div class="grid stats">${stat("Assessments",fmt(filtered.tests.length),"Filtered fitness records","✚")}${stat("Students",fmt(filtered.students.length),"Filtered student register","♧")}${stat("Schools",fmt(filtered.schools.length),"Filtered school master","⌂")}${stat("Average BMI",data.summary.find(x=>x.Metric==="Average BMI").Value||"—","Valid height and weight records","◉")}</div>
      ${card("Mandal-wise Report Preview",data.mandalRows.length?`<div class="table-wrap"><table><thead><tr><th>Mandal</th><th>Schools</th><th>Students</th><th>Assessments</th><th>Assessed Students</th><th>Coverage %</th><th>Average BMI</th></tr></thead><tbody>${data.mandalRows.map(r=>`<tr><td>${esc(r.Mandal)}</td><td>${r.Schools}</td><td>${r.Registered_Students}</td><td>${r.Assessments}</td><td>${r.Unique_Students_Assessed}</td><td>${r.Coverage_Percent}%</td><td>${r.Average_BMI||"—"}</td></tr>`).join("")}</tbody></table></div>`:empty("No mandal records match the selected filters."))}
      <div style="height:14px"></div>${card("Fitness Parameter Summary",`<div class="table-wrap"><table><thead><tr><th>Parameter</th><th>Records with values</th><th>Average</th></tr></thead><tbody>${data.parameterRows.map(r=>`<tr><td>${esc(r.Parameter)}</td><td>${r.Records_With_Values}</td><td>${r.Average||"—"}</td></tr>`).join("")}</tbody></table></div>`)}`;
    return {filtered,data};
  };
  let reportData=updatePreview();
  $("applyReportFilters").onclick=()=>{const f=reportFilters();if(f.from&&f.to&&f.from>f.to){alert("From date cannot be later than To date.");return;}reportData=updatePreview();};
  $("resetReportFilters").onclick=()=>{["reportFrom","reportTo","reportMandal","reportSchool","reportClass","reportGender"].forEach(id=>$(id).value="");reportData=updatePreview();};
  $("reportMandal").addEventListener("change",()=>{
    const m=$("reportMandal").value;const opts=state.schools.filter(s=>!m||s.mandal===m).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    $("reportSchool").innerHTML=`<option value="">All Accessible Schools</option>${opts.map(s=>`<option value="${esc(s.udise)}">${esc(s.name)} — ${esc(s.mandal)} (${esc(s.udise)})</option>`).join("")}`;
  });
  $("exportReportExcel").onclick=()=>{try{const f=reportFilters();if(f.from&&f.to&&f.from>f.to)throw new Error("From date cannot be later than To date.");const result=buildReportData(applyReportFilters(f));downloadReportsExcel(result);}catch(err){alert(showError(err));}};
  $("exportReportPDF").onclick=()=>{try{const f=reportFilters();if(f.from&&f.to&&f.from>f.to)throw new Error("From date cannot be later than To date.");const result=buildReportData(applyReportFilters(f));downloadReportsPDF(result,f);}catch(err){alert(showError(err));}};
  $("exportSchools").onclick=()=>csvDownload("Khelo_Manyam_Schools.csv",applyReportFilters(reportFilters()).schools);
  $("exportStudents").onclick=()=>csvDownload("Khelo_Manyam_Students.csv",applyReportFilters(reportFilters()).students);
  $("exportTests").onclick=()=>csvDownload("Khelo_Manyam_Fitness_Assessments.csv",applyReportFilters(reportFilters()).tests);
  if(isDEO())$("exportUsers").onclick=()=>csvDownload("Khelo_Manyam_Users.csv",state.users.map(({id,...u})=>({uid:id,name:u.name||u.displayName||"",email:u.email||"",role:u.role||"",mandal:u.mandal||"",schoolUdise:u.schoolUdise||"",active:u.active===true?"Active":"Inactive"})));
}

function renderSettings(){
  const p=state.profile;
  pageContent.innerHTML=`<div class="welcome"><h1>System Settings</h1><p>Account and application information.</p></div>
    <div class="card"><h3>Signed-in Profile</h3><div class="table-wrap"><table><tbody>
      <tr><th>Name</th><td>${esc(p.name||p.displayName||"—")}</td></tr><tr><th>Email</th><td>${esc(p.email||state.user.email||"—")}</td></tr>
      <tr><th>Role</th><td>${esc(role())}</td></tr><tr><th>Mandal</th><td>${esc(p.mandal||"—")}</td></tr>
      <tr><th>School UDISE</th><td>${esc(p.schoolUdise||"—")}</td></tr><tr><th>Account Status</th><td>${p.active===true?"Active":"Inactive"}</td></tr>
    </tbody></table></div></div>
    <div class="card" style="margin-top:15px"><h3>System Information</h3><p class="muted tiny">Khelo Manyam · Firebase Authentication + Cloud Firestore · Functions region: asia-south1.</p><p class="muted tiny">Academic year and student master data should be maintained using verified district records.</p></div>`;
}

const VIEWS={
  overview:["District Overview",renderOverview],
  mandals:["Mandal Monitoring",renderMandals],
  schools:["School Management",renderSchools],
  users:["User Management",renderUsers],
  students:["Student Management",renderStudents],
  fitness:["Fitness Data Entry",renderFitness],
  analytics:["Fitness Analytics",renderAnalytics],
  reports:["Reports & Export",renderReports],
  settings:["Settings",renderSettings]
};
async function openView(view){
  if(!VIEWS[view])return;
  if(view==="users"&&!isDEO()){alert("Only DEO Admin can access User Management.");return;}
  state.view=view;state.search="";
  document.querySelectorAll("#mainNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  setPageTitle(VIEWS[view][0]);pageContent.innerHTML=`<div class="empty">Loading ${esc(VIEWS[view][0])}...</div>`;
  try{
    if(["overview","mandals","schools","students","fitness","analytics","reports"].includes(view))await ensureSchools();
    if(["overview","mandals","schools","students","fitness","analytics","reports"].includes(view))await fetchStudents();
    if(["overview","mandals","schools","fitness","analytics","reports"].includes(view))await fetchTests();
    if(view==="users"||view==="reports"&&isDEO())await fetchUsers();
    VIEWS[view][1]();
  }catch(err){pageContent.innerHTML=`<div class="notice">Unable to load this module: ${esc(showError(err))}</div><button class="btn" id="retryView">Retry</button>`;$("retryView").onclick=()=>openView(view);}
}

document.querySelectorAll("#mainNav button").forEach(btn=>{
  btn.addEventListener("click",()=>openView(btn.dataset.view));
});

loginForm.addEventListener("submit",async e=>{
  e.preventDefault();const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password){showLoginError("Enter your official email and password.");return;}
  setLoginBusy(true);showLoginError("");
  try{await signInWithEmailAndPassword(auth,email,password);}
  catch(err){const messages={"auth/invalid-credential":"Invalid email or password.","auth/user-not-found":"User account not found.","auth/wrong-password":"Incorrect password.","auth/invalid-email":"Invalid email address.","auth/too-many-requests":"Too many attempts. Try again later.","auth/network-request-failed":"Check your internet connection.","auth/user-disabled":"This account has been disabled."};showLoginError(messages[err.code]||err.message);setLoginBusy(false);}
});

$("logoutButton").addEventListener("click",async()=>{try{await signOut(auth);loginForm.reset();showLoginError("Successfully logged out.");}catch(err){alert(showError(err));}});

let authChangeToken=0;
onAuthStateChanged(auth,async user=>{
  const token=++authChangeToken;
  if(!user){state.user=null;state.profile=null;state.loaded={};appShell.classList.add("hidden");loginBox.classList.remove("hidden");setLoginBusy(false);return;}
  try{
    const snap=await getDoc(profilePath(user.uid));
    if(token!==authChangeToken)return;
    if(!snap.exists())throw new Error("User profile not found. Contact DEO Administrator.");
    const p=snap.data();
    if(p.active!==true)throw new Error("Your account is inactive. Contact DEO.");
    if(!["DEO","MEO","PD","PET"].includes(String(p.role||"").toUpperCase()))throw new Error("Invalid user role. Contact DEO.");
    if(p.role==="MEO"&&!p.mandal)throw new Error("MEO profile is missing its assigned mandal.");
    if(["PD","PET"].includes(p.role)&&!p.schoolUdise)throw new Error("PD/PET profile is missing its assigned school.");
    state.user=user;state.profile=p;state.loaded={};state.schools=[];state.students=[];state.tests=[];state.users=[];
    loginBox.classList.add("hidden");appShell.classList.remove("hidden");
    const name=p.name||p.displayName||"User";
    $("headerName").textContent=name;$("headerRole").textContent=p.role;$("sideRole").textContent=p.role;$("avatar").textContent=name.charAt(0).toUpperCase();
    document.querySelectorAll('#mainNav button[data-role="DEO"]').forEach(b=>b.classList.toggle("hidden",!isDEO()));
    await openView("overview");
  }catch(err){
    if(token!==authChangeToken)return;
    console.error("PROFILE ERROR",err);showLoginError(err.message||"Unable to load profile.");
    await signOut(auth);loginBox.classList.remove("hidden");appShell.classList.add("hidden");setLoginBusy(false);
  }
});
console.log("KHELO MANYAM COMPLETE DEO DASHBOARD READY");
