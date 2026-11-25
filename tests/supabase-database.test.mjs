import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const ids = { deo:'00000000-0000-4000-8000-000000000001', meo:'00000000-0000-4000-8000-000000000002', pet:'00000000-0000-4000-8000-000000000003', orphan:'00000000-0000-4000-8000-000000000004' };
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611240001_initial.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202611250001_large_registers.sql',import.meta.url),'utf8'));
  for(const id of Object.values(ids))await db.query('insert into auth.users values ($1)',[id]);
  await db.exec(`insert into schools values ('123','School A','BHAMINI','1'), ('456','School B','BHAMINI','1'), ('789','School C','KOMARADA','2');`);
  for(const [name,role,mandal,school] of [['deo','DEO','ALL','ALL'],['meo','MEO','BHAMINI','ALL'],['pet','PET','BHAMINI','123']]){
    await db.query('insert into profiles (id,email,name,"displayName",role,mandal,"schoolUdise","schoolName") values ($1,$2,$3,$3,$4,$5,$6,$6)',[ids[name],`${name}@example.org`,name,role,mandal,school]);
  }
  for(const [id,school,mandal] of [['s1','123','BHAMINI'],['s2','456','BHAMINI'],['s3','789','KOMARADA']]){
    await db.query('insert into students (id,name,"className","schoolUdise","schoolName",mandal,"createdBy") values ($1,$1,\'6\',$2,\'forged\',$3,$4)',[id,school,mandal,ids.deo]);
  }
});
after(async()=>{await db?.close();});
async function as(name,callback){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]||'']);
  await db.exec(`set role ${name==='anon'?'anon':'authenticated'}`);
  try{return await callback();}finally{await db.exec('reset role');}
}
test('SQL migration installs RLS on every exposed table',async()=>{
  const {rows}=await db.query("select relname,relrowsecurity from pg_class where relname in ('profiles','schools','students','fitness_tests')");
  assert.equal(rows.length,4);assert.ok(rows.every(row=>row.relrowsecurity));
});
test('school seed loads the 200 existing master records and is repeatable',async()=>{
  const seed=await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8');
  await db.exec(seed);await db.exec(seed);
  const {rows}=await db.query('select count(*)::int as total from schools');
  assert.equal(rows[0].total,203); // 200 master records plus the three isolated test schools.
});
test('DEO, MEO and PET see their permitted student scope',async()=>{
  for(const [role,expected] of [['deo',['s1','s2','s3']],['meo',['s1','s2']],['pet',['s1']],['orphan',[]]]){
    const {rows}=await as(role,()=>db.query('select id from students order by id'));
    assert.deepEqual(rows.map(row=>row.id),expected);
  }
  await assert.rejects(as('anon',()=>db.query('select * from students')),/permission denied/);
});
test('users cannot change roles, provision profiles or edit the school master',async()=>{
  await assert.rejects(as('pet',()=>db.query("update profiles set role='DEO' where id=$1",[ids.pet])),/permission denied/);
  await assert.rejects(as('deo',()=>db.query("update schools set name='Forged'")),/permission denied/);
  await assert.rejects(as('deo',()=>db.query('insert into profiles (id) values ($1)',[ids.orphan])),/permission denied/);
});
test('school staff can write their own students; MEO and cross-school writes fail',async()=>{
  const insert=(id,school,creator)=>db.query('insert into students (id,name,"className","schoolUdise","schoolName",mandal,"createdBy") values ($1,$1,\'7\',$2,\'forged\',\'BHAMINI\',$3)',[id,school,creator]);
  await as('pet',()=>insert('new-school-student','123',ids.pet));
  await assert.rejects(as('pet',()=>insert('foreign-student','456',ids.pet)));
  await assert.rejects(as('meo',()=>insert('meo-student','123',ids.meo)));
  await assert.rejects(as('pet',()=>insert('forged-author','123',ids.deo)));
  const {rows}=await db.query("select \"schoolName\" from students where id='new-school-student'");
  assert.equal(rows[0].schoolName,'School A');
  await assert.rejects(as('pet',()=>db.query('update students set "createdBy"=$1 where id=\'new-school-student\'',[ids.deo])),/Creation fields/);
});
test('assessments derive scope and names from student and calculate BMI on the server',async()=>{
  const insert=(student)=>db.query('insert into fitness_tests ("studentId","studentName","className","schoolUdise","schoolName",mandal,"testDate","heightCm","weightKg","createdBy") values ($1,\'forged\',\'6\',\'123\',\'forged\',\'BHAMINI\',\'2026-11-24\',150,45,$2) returning *',[student,ids.pet]);
  const {rows}=await as('pet',()=>insert('s1'));
  assert.equal(Number(rows[0].bmi),20);assert.equal(rows[0].studentName,'s1');assert.equal(rows[0].schoolName,'School A');
  await assert.rejects(as('pet',()=>insert('s2')));
  await assert.rejects(as('pet',()=>db.exec('update fitness_tests set bmi=999')));
});
test('deactivation removes access for an existing authenticated identity',async()=>{
  await db.query('update profiles set active=false where id=$1',[ids.pet]);
  const {rows}=await as('pet',()=>db.query('select * from students'));
  assert.deepEqual(rows,[]);
  await db.query('update profiles set active=true where id=$1',[ids.pet]);
});
test('summary, pagination and spreadsheet lookups preserve row permissions',async()=>{
  for(const [role,expected] of [['deo',4],['meo',3],['pet',2],['orphan',0]]){
    const summary=await as(role,()=>db.query('select public.dashboard_summary() as data'));
    assert.equal(summary.rows[0].data.students,expected);
    const page=await as(role,()=>db.query("select public.student_page('',1,100) as data"));
    assert.equal(page.rows[0].data.total,expected);
    const matches=await as(role,()=>db.query('select public.match_students($1::jsonb) as data',[JSON.stringify([{studentId:'s2'}])]));
    assert.equal(matches.rows[0].data.length,['deo','meo'].includes(role)?1:0);
  }
  await assert.rejects(as('anon',()=>db.query('select public.dashboard_summary()')),/permission denied/);
  await assert.rejects(as('pet',()=>db.query('select public.match_students($1::jsonb)',[JSON.stringify(Array(451).fill({studentId:'s1'}))])),/450/);
});
test('server search treats percent and underscore literally, and caps page size',async()=>{
  await db.query('insert into students (id,name,"className","schoolUdise","schoolName",mandal,"createdBy") values (\'literal\',\'100%_Verified\',\'6\',\'123\',\'School A\',\'BHAMINI\',$1)',[ids.deo]);
  const {rows}=await as('deo',()=>db.query("select public.student_page('%_',999,50000) as data"));
  assert.equal(rows[0].data.total,1);assert.equal(rows[0].data.pageSize,100);assert.equal(rows[0].data.page,1);
});
test('50,000 students and assessments stay in PostgreSQL while responses remain bounded',async()=>{
  const baseline=(await db.query('select count(*)::int n from students')).rows[0].n;
  const start=performance.now();
  await db.query(`insert into students (id,name,pen,"className","schoolUdise","schoolName",mandal,"createdBy")
    select 'scale-'||lpad(i::text,5,'0'),'Scale student '||i,'PEN-'||i,'6',case when i%2=0 then '123' else '456' end,'School','BHAMINI',$1 from generate_series(1,50000) i`,[ids.deo]);
  await db.query(`insert into fitness_tests (id,"studentId","studentName","className","schoolUdise","schoolName",mandal,"testDate","heightCm","weightKg","createdBy")
    select 'test-'||i,'scale-'||lpad(i::text,5,'0'),'Student','6','123','School','BHAMINI','2026-11-25',150,45,$1 from generate_series(1,50000) i`,[ids.deo]);
  const summary=(await as('deo',()=>db.query('select public.dashboard_summary() data'))).rows[0].data;
  assert.equal(summary.students,baseline+50000);assert.equal(summary.tests,50001);assert.equal(summary.assessed,50001);
  assert.equal(summary.recent.length,8);assert.ok(JSON.stringify(summary).length<40000);
  const page=(await as('deo',()=>db.query("select public.student_page('Scale student',500,100) data"))).rows[0].data;
  assert.equal(page.total,50000);assert.equal(page.rows.length,100);assert.equal(page.page,500);
  const last=(await as('deo',()=>db.query("select public.student_page('PEN-50000',1,100) data"))).rows[0].data;
  assert.equal(last.total,1);assert.equal(last.rows[0].id,'scale-50000');
  const staff=(await as('pet',()=>db.query("select public.student_page('Scale student',1,100) data"))).rows[0].data;
  assert.equal(staff.total,25000);assert.ok(staff.rows.every(row=>row.schoolUdise==='123'));
  const fitness=(await as('pet',()=>db.query("select public.fitness_page('',1,50) data"))).rows[0].data;
  assert.equal(fitness.total,25001);assert.equal(fitness.rows.length,50);
  const identifiers=Array.from({length:450},(_,i)=>({studentId:'scale-'+String(i+1).padStart(5,'0')}));
  const matched=(await as('pet',()=>db.query('select public.match_students($1::jsonb) data',[JSON.stringify(identifiers)]))).rows[0].data;
  assert.equal(matched.length,225);assert.ok(matched.every(match=>match.student.schoolUdise==='123'));
  console.log(`Local synthetic scale check completed in ${Math.round(performance.now()-start)} ms; no hosted student records were used.`);
});
