import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const server=createServer(async(req,res)=>{
  const path=req.url==='/'?'index.html':req.url.slice(1).split('?')[0];
  if(!/^[a-zA-Z0-9.-]+$/.test(path)){res.writeHead(404).end();return;}
  try{const data=await readFile(join(process.cwd(),path));res.setHeader('Content-Type',extname(path)==='.html'?'text/html':'text/javascript');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/supabase-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const supabaseConfig={url:'',publishableKey:''};"}));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('Supabase setup is pending'),{timeout:30000});
  assert.equal(await page.locator('#loginButton').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('Browser: unconfigured Supabase shows setup message and disables login.');
  await page.unroute('**/supabase-config.js');
  await page.route('**/supabase-client.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export const setupError='';
    const rows={schools:[{udise:'123',name:'Test School',mandal:'BHAMINI',mandalCode:'1'}],profiles:[{id:'admin',email:'admin@example.org',name:'Admin',displayName:'Admin',role:'DEO',active:true,mandal:'ALL',schoolUdise:'ALL'}],students:[],fitness_tests:[]};
    let notify;
    export const supabase={auth:{onAuthStateChange(fn){notify=fn;fn('INITIAL_SESSION',null);},async signInWithPassword(){notify('SIGNED_IN',{user:{id:'admin',email:'admin@example.org'}});return {error:null};},async signOut(){notify('SIGNED_OUT',null);return {error:null};}},
      from(table){let filters=[],cursor;return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},range(){return this;},gt(key,value){cursor=value;return this;},async maybeSingle(){return {data:rows[table].find(row=>filters.every(([k,v])=>row[k]===v)),error:null};},async insert(data){rows[table].push(...(Array.isArray(data)?data:[data]));return {error:null};},then(resolve){return Promise.resolve({data:rows[table].filter(row=>filters.every(([k,v])=>row[k]===v)&&(!cursor||row.id>cursor)),error:null}).then(resolve);}}},
      functions:{async invoke(name,{body}){window.lastCreate=body;const {password,...profile}=body;rows.profiles.push({id:'created',...profile,name:body.displayName,active:true});return {data:{uid:'created'},error:null};}}};
  `}));
  await page.reload({waitUntil:'networkidle'});
  await page.fill('#email','admin@example.org');await page.fill('#password','Admin1234');await page.click('#loginButton');
  await page.waitForSelector('#appShell:not(.hidden)');
  await page.click('[data-view="users"]');await page.waitForSelector('#importUsersBtn');await page.click('#importUsersBtn');
  await page.selectOption('#importRole','PET');await page.selectOption('#importSchool','123');
  await page.setInputFiles('#staffExcel',{name:'staff.csv',mimeType:'text/csv',buffer:Buffer.from('email,password\nstaff@example.org,Private123\n')});
  await page.click('button:has-text("Validate & Preview")');
  await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('1 accounts validated'));
  assert.ok(!(await page.locator('#importPreview').innerText()).includes('Private123'));
  await page.click('#createImportedUsers');
  await page.waitForFunction(()=>document.querySelector('#importStatus').textContent.includes('1 of 1 accounts created'));
  assert.equal(await page.evaluate(()=>window.lastCreate.password),'Private123');
  assert.equal(await page.locator('#appShell').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('Browser: mocked Supabase login, Excel CSV validation, password-free preview and account creation passed.');
}catch(error){console.error({pageErrors:errors,message:await page.locator('#message').innerText()});throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
