import { mkdir, copyFile } from 'node:fs/promises';

// Explicit allowlist: database setup, tests and private local files are never published.
const assets=['index.html','app.js','supabase-config.js','supabase-client.js','data-api.mjs','managed-users.js','user-import.mjs'];
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
for(const name of assets)await copyFile(new URL('../'+name,import.meta.url),new URL('../dist/'+name,import.meta.url));
console.log(`Prepared ${assets.length} public assets in dist/.`);
