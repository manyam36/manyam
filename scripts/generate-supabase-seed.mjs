import { readFile, writeFile } from 'node:fs/promises';
const schools=JSON.parse(await readFile(new URL('../schools.json',import.meta.url),'utf8'));
if(schools.length!==200||new Set(schools.map(s=>s.udise)).size!==200)throw new Error('Expected 200 unique school master records.');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const values=schools.map(s=>`(${[s.udise,s.name,s.mandal,s.mandalCode].map(quote).join(', ')})`).join(',\n');
const sql=`-- Generated from schools.json; run after the schema migration.\nbegin;\ninsert into public.schools (udise,name,mandal,"mandalCode") values\n${values}\non conflict (udise) do update set name=excluded.name, mandal=excluded.mandal, "mandalCode"=excluded."mandalCode";\ncommit;\n`;
await writeFile(new URL('../supabase/seed.sql',import.meta.url),sql);
console.log(`Prepared ${schools.length} schools in supabase/seed.sql. No remote data was changed.`);
