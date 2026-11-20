import {access,cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {DEFAULT_EVENTS} from '../worker/index.js';
const photoSources=JSON.parse(await readFile('photo-sources.json','utf8'));
if(photoSources.length<5||photoSources.length>50)throw new Error('The wedding gallery must contain 5 to 50 selected photos.');
for(const [index,photo] of photoSources.entries()){
 const expected=`photo-${String(index+1).padStart(2,'0')}-new.webp`;
 if(photo.asset!==expected)throw new Error(`Invalid photo mapping for slot ${index+1}.`);
 await Promise.all([access(`public/assets/${expected}`),access(`public/assets/${expected.replace('photo-','thumb-')}`)]);
}
await rm('dist',{recursive:true,force:true});
await mkdir('dist/client',{recursive:true});await mkdir('dist/server-assets',{recursive:true});
// Keep every privileged HTML page out of the public output directory.
await cp('public','dist/client',{recursive:true,filter:source=>!source.endsWith('.html')||source.endsWith('/index.html')});
for(const page of ['index.html','admin-login.html','wedding-desk-shell.html'])await cp('public/'+page,'dist/server-assets/'+page);
await writeFile('dist/client/wedding-config.js','window.WEDDING = '+JSON.stringify({date:DEFAULT_EVENTS[0].start,timeZone:'Asia/Jakarta',events:Object.fromEntries(DEFAULT_EVENTS.map(e=>[e.id,e]))},null,2)+';\n');
console.log('Built Vercel static invitation and private server HTML. Backend is bundled from api/backend.js.');
