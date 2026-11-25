import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/manage-users/handler.mjs';

const valid={action:'create',email:'STAFF@example.org',password:'Private123',displayName:'Staff',role:'PET',mandal:'BHAMINI',schoolUdise:'123'};
function setup(options={}){
  const state={profiles:[],created:[],deleted:[],updates:[]};
  const admin={
    auth:{getUser:async()=>({data:{user:{id:'admin'}},error:options.authError}),admin:{
      createUser:async payload=>{state.created.push(payload);return {data:options.createError?null:{user:{id:'new-staff'}},error:options.createError};},
      deleteUser:async uid=>{state.deleted.push(uid);return {error:options.cleanupError};}
    }},
    from(table){let identifier;const request={
      select(){return this;},eq(_column,value){identifier=value;return this;},limit(){return this;},
      async maybeSingle(){return {data:table==='schools'?(options.school??{udise:'123',name:'School',mandal:'BHAMINI',mandalCode:'1'}):identifier==='admin'?(options.caller??{role:'DEO',active:true}):{role:options.targetRole||'PET'},error:null};},
      async insert(profile){state.profiles.push(profile);return {error:options.profileError};},
      update(patch){state.updates.push(patch);return {eq:async()=>({error:null})};}
    };return request;}
  };
  const handler=createHandler(()=>admin,{url:'https://test.supabase.co',serviceRoleKey:'server-only-key'});
  const send=(body=valid,authorized=true)=>handler(new Request('https://test/functions/v1/manage-users',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer token'}:{})},body:JSON.stringify(body)}));
  return {state,send,handler};
}
test('requires authenticated, active DEO for server administration',async()=>{
  assert.equal((await setup().send(valid,false)).status,401);
  assert.equal((await setup({authError:{message:'expired'}}).send()).status,401);
  for(const caller of [{role:'PET',active:true},{role:'DEO',active:false}]){
    const {send,state}=setup({caller});assert.equal((await send()).status,403);assert.equal(state.created.length,0);
  }
});
test('validates role and school before creating an identity',async()=>{
  for(const changes of [{role:'DEO'},{password:'short'},{mandal:'KOMARADA'}]){
    const {send,state}=setup();assert.equal((await send({...valid,...changes})).status,400);assert.equal(state.created.length,0);
  }
});
test('creates Auth identity and assigned profile without storing or returning password',async()=>{
  const {send,state}=setup();const response=await send();
  assert.equal(response.status,200);const body=await response.text();assert.ok(!body.includes(valid.password));
  assert.equal(state.created[0].email,'staff@example.org');assert.equal(state.created[0].password,valid.password);
  assert.equal(state.profiles[0].createdBy,'admin');assert.equal(state.profiles[0].schoolUdise,'123');
  assert.ok(!('password' in state.profiles[0]));assert.equal(state.deleted.length,0);
});
test('duplicate Auth emails never overwrite existing passwords or profiles',async()=>{
  const {send,state}=setup({createError:{code:'email_exists'}});assert.equal((await send()).status,409);
  assert.equal(state.profiles.length,0);assert.equal(state.deleted.length,0);
});
test('failed profile creation rolls back only the newly created identity',async()=>{
  const {send,state}=setup({profileError:{message:'insert failed'}});assert.equal((await send()).status,500);
  assert.deepEqual(state.deleted,['new-staff']);
  const failure=await setup({profileError:{},cleanupError:{}}).send();
  assert.match((await failure.json()).error,/could not be removed/);
});
test('status changes protect DEO accounts and use profile access checks',async()=>{
  const {send,state}=setup();assert.equal((await send({action:'set-status',uid:'staff',active:false})).status,200);
  assert.equal(state.updates[0].active,false);
  assert.equal((await send({action:'set-status',uid:'admin',active:false})).status,400);
  assert.equal((await setup({targetRole:'DEO'}).send({action:'set-status',uid:'other-admin',active:false})).status,403);
});
test('handles browser preflight without running account creation',async()=>{
  const {handler,state}=setup();const response=await handler(new Request('https://test',{method:'OPTIONS'}));
  assert.equal(response.status,200);assert.match(response.headers.get('Access-Control-Allow-Headers'),/authorization/);assert.equal(state.created.length,0);
});
