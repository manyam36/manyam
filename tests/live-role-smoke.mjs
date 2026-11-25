// Opt-in, read-only hosted checks for explicitly provided MEO/PET accounts.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {supabaseConfig} from '../supabase-config.js';

const accounts=JSON.parse(process.env.MANYAM_ROLE_ACCOUNTS||'[]');
if(accounts.length!==2)throw new Error('Supply two role accounts through the environment.');
const server=createServer(async(req,res)=>{
  const path=req.url==='/'?'index.html':req.url.slice(1).split('?')[0];
  if(!/^[a-zA-Z0-9.-]+$/.test(path)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',extname(path)==='.html'?'text/html':'text/javascript');res.end(await readFile(join(process.cwd(),path)));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
try{
 for(const account of accounts){
  const login=await fetch(supabaseConfig.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:supabaseConfig.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
  assert.equal(login.status,200,'The assigned account must sign in.');
  const session=await login.json();
  const request=(path,body)=>fetch(supabaseConfig.url+path,{method:body?'POST':'GET',headers:{apikey:supabaseConfig.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const profile=await (await request('/rest/v1/profiles?select=id,role,mandal,schoolUdise')).json();
  assert.equal(profile.length,1);assert.equal(profile[0].role,account.role);assert.equal(profile[0].mandal,'PARVATHIPURAM');
  const schools=await (await request('/rest/v1/schools?select=udise,mandal')).json();
  assert.ok(schools.length>0);assert.ok(schools.every(s=>s.mandal==='PARVATHIPURAM'));
  if(account.role==='PET')assert.deepEqual(schools.map(s=>s.udise),[account.schoolUdise]);
  const summaryResponse=await request('/rest/v1/rpc/dashboard_summary',{});assert.equal(summaryResponse.status,200);
  const summary=await summaryResponse.json();assert.equal(Object.keys(summary.bySchool).length,schools.length);
  const students=await (await request('/rest/v1/rpc/student_page',{p_search:'',p_page:1,p_size:100})).json();
  assert.ok(students.rows.length<=100);assert.ok(students.rows.every(s=>s.mandal==='PARVATHIPURAM'));
  const denied=await request('/functions/v1/manage-users',{action:'create'});assert.equal(denied.status,403);
  const context=await browser.newContext(),page=await context.newPage(),errors=[],fullReads=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/rest\/v1\/(students|fitness_tests)\?/.test(request.url()))fullReads.push(request.url());});
  await page.goto(process.env.MANYAM_TARGET_URL||`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.fill('#email',account.email);await page.fill('#password',account.password);await page.click('#loginButton');
  await page.waitForSelector('.stat-value');assert.equal(await page.locator('#headerRole').innerText(),account.role);
  await page.click('[data-view="students"]');await page.waitForSelector('#registerSearchForm');
  assert.equal(await page.locator('#addStudentBtn').count(),account.role==='MEO'?0:1);
  await page.fill('#studentSearch','No such student validation');await page.click('#registerSearchForm button');
  await page.waitForFunction(()=>document.querySelector('#registerStatus')?.textContent!=='Loading...');
  await page.click('[data-view="fitness"]');await page.waitForSelector('#fitnessSearch');
  assert.equal(await page.locator('#newFitnessBtn').count(),account.role==='MEO'?0:1);
  assert.deepEqual(errors,[]);assert.deepEqual(fullReads,[]);
  await context.close();
  console.log(`Live ${account.role} check passed: login, assigned school scope, database summaries, pagination and denied user administration.`);
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
