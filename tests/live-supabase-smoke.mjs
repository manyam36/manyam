// Opt-in live check. Creates one temporary staff identity and removes it in finally.
// Requires MANYAM_ADMIN_EMAIL/PASSWORD and an authenticated project-owner CLI.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { supabaseConfig } from '../supabase-config.js';

if (!process.env.MANYAM_ADMIN_EMAIL || !process.env.MANYAM_ADMIN_PASSWORD) throw new Error('Provide administrator credentials through environment variables.');
const ref = new URL(supabaseConfig.url).hostname.split('.')[0];
const keys = JSON.parse(execFileSync('cmd.exe', ['/d','/s','/c',`npx.cmd --yes supabase@latest projects api-keys --remote=${ref} --reveal --output json --output-format json`], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }));
const serverKey = keys.find(key=>key.name==='service_role')?.api_key || keys.find(key=>key.type==='secret')?.api_key;
if (!serverKey) throw new Error('Project-owner administration is required to remove the temporary test identity.');
const staffEmail = `manyam-setup-${Date.now()}@example.org`;
const staffPassword = randomBytes(16).toString('base64url')+'A9!';
let staffUid, browser;
const request = (path, {token, privileged=false, ...options}={}) => fetch(supabaseConfig.url+path, {
  ...options, headers:{apikey:privileged?serverKey:supabaseConfig.publishableKey,...(token||privileged?{Authorization:'Bearer '+(privileged?serverKey:token)}:{}),'Content-Type':'application/json'}
});
const server = createServer(async(req,res)=>{
  const path=req.url==='/'?'index.html':req.url.slice(1).split('?')[0];
  if(!/^[a-zA-Z0-9.-]+$/.test(path)){res.writeHead(404).end();return;}
  try{const data=await readFile(join(process.cwd(),path));res.setHeader('Content-Type',extname(path)==='.html'?'text/html':'text/javascript');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const anonymous = await request('/rest/v1/schools?select=udise');
  assert.ok([401,403].includes(anonymous.status),'Anonymous users must not read schools.');
  const noToken = await request('/functions/v1/manage-users',{method:'POST',body:JSON.stringify({action:'create'})});
  assert.equal(noToken.status,401);
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.fill('#email',process.env.MANYAM_ADMIN_EMAIL);
  await page.fill('#password',process.env.MANYAM_ADMIN_PASSWORD);
  await page.click('#loginButton');
  await page.waitForSelector('#appShell:not(.hidden)',{timeout:30000});
  await page.click('[data-view="schools"]');
  await page.waitForFunction(()=>document.querySelectorAll('#pageContent tbody tr').length===200);
  console.log('Live check: administrator login and all 200 school records loaded.');
  await page.click('[data-view="users"]');
  await page.waitForSelector('#importUsersBtn');
  await page.click('#importUsersBtn');
  await page.selectOption('#importRole','PET');
  await page.selectOption('#importSchool','28120901710');
  await page.setInputFiles('#staffExcel',{name:'setup-check.csv',mimeType:'text/csv',buffer:Buffer.from(`email,password\n${staffEmail},${staffPassword}\n`)});
  await page.click('button:has-text("Validate & Preview")');
  await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('1 accounts validated'));
  assert.ok(!(await page.locator('#importPreview').innerText()).includes(staffPassword));
  await page.click('#createImportedUsers');
  await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('1 of 1 accounts created'),{timeout:60000});
  assert.equal(await page.locator('#appShell').isVisible(),true);
  const lookup = await request('/rest/v1/profiles?select=id,role,active&email=eq.'+encodeURIComponent(staffEmail),{privileged:true});
  const profiles = await lookup.json();
  assert.equal(profiles.length,1);staffUid=profiles[0].id;
  assert.equal(profiles[0].role,'PET');assert.equal(profiles[0].active,true);
  console.log('Live check: spreadsheet created a working staff profile while preserving the administrator session.');
  const login = await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:staffEmail,password:staffPassword})});
  assert.equal(login.status,200);let staffSession=await login.json();
  const scope = await request('/rest/v1/schools?select=udise',{token:staffSession.access_token});
  assert.deepEqual(await scope.json(),[{udise:'28120901710'}]);
  const forbidden = await request('/functions/v1/manage-users',{token:staffSession.access_token,method:'POST',body:JSON.stringify({action:'create'})});
  assert.equal(forbidden.status,403);
  const staffContext=await browser.newContext();
  const staffPage=await staffContext.newPage();
  await staffPage.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await staffPage.fill('#email',staffEmail);await staffPage.fill('#password',staffPassword);await staffPage.click('#loginButton');
  await staffPage.waitForSelector('#appShell:not(.hidden)');
  await staffPage.click('[data-view="settings"]');
  const replacementPassword=randomBytes(16).toString('base64url')+'A9!';
  await staffPage.fill('#newPassword',replacementPassword);await staffPage.fill('#confirmPassword','DoesNotMatch123!');
  await staffPage.click('#changePasswordButton');
  assert.equal(await staffPage.locator('#passwordStatus').innerText(),'Passwords do not match.');
  await staffPage.fill('#confirmPassword',replacementPassword);await staffPage.click('#changePasswordButton');
  await staffPage.waitForFunction(()=>document.querySelector('#passwordStatus').textContent==='Password updated successfully.');
  const changedLogin=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:staffEmail,password:replacementPassword})});
  assert.equal(changedLogin.status,200);staffSession=await changedLogin.json();
  await staffContext.close();
  console.log('Live check: staff can change their own password in Settings and sign in with it.');
  await page.click('#closeImport');
  await page.click(`[data-toggle-user="${staffUid}"]`);
  await page.waitForSelector(`[data-toggle-user="${staffUid}"][data-active="false"]`);
  const deactivated = await request('/rest/v1/schools?select=udise',{token:staffSession.access_token});
  assert.deepEqual(await deactivated.json(),[]);
  assert.deepEqual(errors,[]);
  console.log('Live check: school scope, staff administration denial and immediate deactivation enforcement passed.');
} finally {
  if(!staffUid){
    const lookup=await request('/rest/v1/profiles?select=id&email=eq.'+encodeURIComponent(staffEmail),{privileged:true});
    if(lookup.ok)staffUid=(await lookup.json())[0]?.id;
  }
  if(staffUid){
    const cleanup=await request('/auth/v1/admin/users/'+staffUid,{privileged:true,method:'DELETE'});
    if(!cleanup.ok)console.error('Temporary test identity cleanup failed; inspect the setup-check staff account in Authentication.');
    else console.log('Live check: temporary staff identity and profile removed.');
  }
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
