import {readFile,readdir} from 'node:fs/promises';
import {verifyBackup} from './verify-backup.mjs';
const errors=[],required=['SUPABASE_URL','WEDDING_DB_TOKEN','SUPABASE_STORAGE_KEY','ADMIN_EMAIL','ADMIN_ACCESS_CODE','ADMIN_SESSION_SECRET','OPENAI_API_KEY'];
for(const key of required)if(!process.env[key])errors.push('Missing server variable: '+key);
if(process.env.SUPABASE_URL&&process.env.SUPABASE_URL!=='https://lgwrwymrjcptoztjvbxz.supabase.co')errors.push('Wrong production database');
for(const file of ['vercel.json','scripts/build.mjs','api/backend.js','server/vercel.js','server/storage.js','worker/index.js'])if(/chatgpt\.site|\.openai\/hosting/.test(await readFile(file,'utf8')))errors.push('Legacy runtime reference: '+file);
try{const backup=JSON.parse(await readFile(process.env.WEDDING_BACKUP_PATH||'.local/backups/production-before-cutover-2026-10-30.json','utf8'));await verifyBackup(backup);if(!Number.isFinite(Date.parse(backup.capturedAt))||Date.now()-Date.parse(backup.capturedAt)>3600000)errors.push('Fresh production baseline within one hour required');}catch{errors.push('Verified recoverable backup required');}
try{const m=JSON.parse(await readFile('.local/migration/media-manifest.json','utf8'));if(!m.verified||!m.sourceRechecked||m.sourceCount!==m.objects.length||m.objects.some(o=>!o.verified||!o.sha256))errors.push('Complete checksum-verified media transfer and source recheck required');}catch{errors.push('Verified R2 to Supabase media manifest required');}
if((await readdir('dist/client')).some(name=>['wedding-desk-shell.html','admin.html','admin-login.html'].includes(name)))errors.push('Private HTML is present in public build output');
if(errors.length){console.error(JSON.stringify({release:'BLOCKED',reasons:errors},null,2));process.exitCode=1;}else console.log(JSON.stringify({release:'READY_FOR_PREVIEW_ACCEPTANCE',note:'Real preview flows, current production baseline, rollback and affected-device validation still required.'}));
