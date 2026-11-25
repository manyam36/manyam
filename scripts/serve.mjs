import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets=new Set(['index.html','app.js','supabase-config.js','supabase-client.js','data-api.mjs','managed-users.js','user-import.mjs']);
const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!assets.has(name)){response.writeHead(404).end('Not found');return;}
  try{
    const content=await readFile(new URL('../'+name,import.meta.url));
    response.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    response.end(content);
  }catch{response.writeHead(500).end('Unable to load this asset');}
});
server.listen(5000,'127.0.0.1',()=>console.log('Khelo Manyam: http://localhost:5000'));
