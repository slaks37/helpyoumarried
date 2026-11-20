import {AwsClient} from 'aws4fetch';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const PROJECT='https://lgwrwymrjcptoztjvbxz.supabase.co';
const uuid='[a-f0-9-]{36}';
const mimeFor=key=>({jpg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',pdf:'application/pdf'})[key.split('.').pop()];
export function classifyObject(key){
 if(new RegExp('^'+uuid+'\\.(jpg|png|webp|avif)$').test(key))return {bucket:'wedding-gallery',key,max:8000000};
 if(new RegExp('^gift-proofs/'+uuid+'\\.(jpg|png|webp|avif|pdf)$').test(key))return {bucket:'wedding-private',key,max:5000000};
 return {bucket:'wedding-archive',key,max:50000000};
}
const unescapeXML=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v.toLowerCase()]);
export function parseList(xml){
 const tag=(block,name)=>unescapeXML(block.match(new RegExp('<'+name+'>([\\s\\S]*?)</'+name+'>'))?.[1]||'');
 const objects=[...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m=>({key:tag(m[1],'Key'),size:Number(tag(m[1],'Size')),etag:tag(m[1],'ETag')}));
 if(objects.some(o=>!o.key||!Number.isSafeInteger(o.size)||o.size<0))throw new Error('Invalid source inventory');
 return {objects,cursor:tag(xml,'NextContinuationToken'),truncated:tag(xml,'IsTruncated')==='true'};
}
export function requiredMedia(backup){
 const refs=new Set();for(const table of ['public.settings','public.gifts'])for(const json of backup.rows[table]||[]){
  const row=JSON.parse(json);if(row.proof_key)refs.add(row.proof_key);
  for(const m of json.matchAll(/\/media\/([a-f0-9-]{36}\.(?:jpg|png|webp|avif))/g))refs.add(m[1]);
 }return refs;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function checked(r,label){if(!r.ok)throw new Error(label+' failed (HTTP '+r.status+')');return r;}
async function main(){
 const copy=process.argv.includes('--copy'),sites=process.argv.includes('--sites-source'),e=process.env;
 if(!sites){
  for(const name of ['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'])if(!e[name])throw new Error(name+' is required; production cutover is BLOCKED.');
  if(!/^[a-f0-9]{32}$/.test(e.R2_ACCOUNT_ID)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(e.R2_BUCKET))throw new Error('Invalid R2 source');
 }
 if(copy&&(!e.SUPABASE_STORAGE_KEY||e.SUPABASE_URL!==PROJECT))throw new Error('Configure the existing Supabase Storage server key; production cutover is BLOCKED.');
 const backup=JSON.parse(await readFile('.local/backups/production-before-vercel-migration-2026-10-30.json','utf8')),refs=requiredMedia(backup);
 let list,get,identity;
 if(sites){
  const session=JSON.parse(await readFile('.local/migration/source-session.json','utf8'));
  if(session.origin!=='https://stefen-jessica-forever-office.stefenlaks.chatgpt.site'||!/^sj_admin=[A-Za-z0-9_.-]+$/.test(session.cookie)||!/^[a-f0-9]{64}$/.test(session.exportToken))throw Error('Invalid authenticated original source');
  const request=path=>fetch(session.origin+path,{headers:{Cookie:session.cookie,'x-wedding-export-token':session.exportToken},redirect:'error',signal:AbortSignal.timeout(60000)});
  list=async cursor=>{const r=await checked(await request('/api/admin/migration-media'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),'Original R2 binding inventory');const page=await r.json();if(page.source?.project!=='appgprj_6ab47d5e1fb4819180cbf349e343f66f'||page.source?.binding!=='BUCKET')throw Error('Wrong original bucket binding');return page;};
  get=key=>request('/api/admin/migration-media/object?key='+encodeURIComponent(key));identity={type:'original-sites-r2-binding',project:'appgprj_6ab47d5e1fb4819180cbf349e343f66f',binding:'BUCKET'};
 }else{
  const source=new AwsClient({accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'}),root=`https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}/`;
  list=async cursor=>{const url=new URL(root);url.searchParams.set('list-type','2');if(cursor)url.searchParams.set('continuation-token',cursor);return parseList(await(await checked(await source.fetch(url),'R2 inventory')).text());};
  get=key=>source.fetch(root+key.split('/').map(encodeURIComponent).join('/'));identity={type:'r2-s3',account:e.R2_ACCOUNT_ID,bucket:e.R2_BUCKET};
 }
 const inventory=async()=>{const objects=[];let cursor='';do{const page=await list(cursor);objects.push(...page.objects);if(page.truncated&&!page.cursor)throw Error('Incomplete R2 inventory');cursor=page.truncated?page.cursor:'';}while(cursor);return objects;};
 const objects=await inventory();
 if(new Set(objects.map(o=>o.key)).size!==objects.length)throw new Error('Duplicate source keys');
 for(const key of refs)if(!objects.some(o=>o.key===key))throw new Error('A required media object is absent from R2; cutover BLOCKED.');
 const manifest={capturedAt:new Date().toISOString(),source:identity,requiredReferences:refs.size,sourceCount:objects.length,verified:false,objects:[]};
 const bridge=/^wedding_storage_[a-f0-9]{64}$/.test(e.SUPABASE_STORAGE_KEY||'');
 if(copy&&e.SUPABASE_STORAGE_KEY?.startsWith('wedding_storage_preview_'))throw Error('Full original media must target production buckets, not QA buckets');
 const headers=bridge?{'x-wedding-storage-token':e.SUPABASE_STORAGE_KEY}:{apikey:e.SUPABASE_STORAGE_KEY,Authorization:'Bearer '+e.SUPABASE_STORAGE_KEY};
 const api=(path,options={})=>fetch(PROJECT+(bridge?'/functions/v1/wedding-storage':'/storage/v1')+path,{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(60000)});
 if(copy)for(const id of ['wedding-gallery','wedding-private','wedding-staging','wedding-archive']){
  const existing=await api('/bucket/'+id);
  if(existing.ok){if((await existing.json()).public)throw new Error('Target bucket must be private: '+id);continue;}
  const limit=id==='wedding-private'?5000000:id==='wedding-archive'?50000000:8000000;
  await checked(await api('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:id,public:false,file_size_limit:limit,...(id==='wedding-archive'?{}:{allowed_mime_types:id==='wedding-gallery'?['image/jpeg','image/png','image/webp','image/avif']:['image/jpeg','image/png','image/webp','image/avif','application/pdf']})})}),'Storage bucket creation');
 }
 for(const object of objects){
  const target=classifyObject(object.key),entry={...object,targetBucket:target.bucket,required:refs.has(object.key),verified:false};
  if(copy){
   if(object.size>target.max)throw new Error('Source object exceeds its target bucket limit; cutover BLOCKED.');
   const r=await checked(await get(object.key),'R2 object download');
   if(r.headers.get('etag')!==object.etag)throw new Error('R2 changed during migration; rerun inventory.');
   const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==object.size)throw new Error('Source size mismatch');
   const mime=r.headers.get('content-type')||mimeFor(object.key)||'application/octet-stream',url='/object/'+target.bucket+'/'+target.key.split('/').map(encodeURIComponent).join('/');
   const prior=await api(url);
   if(prior.ok){const stored=Buffer.from(await prior.arrayBuffer());if(hash(stored)!==hash(bytes))throw new Error('An existing target differs; refusing to overwrite.');}
   else{if(![400,404].includes(prior.status))throw new Error('Storage target read failed');await checked(await api(url,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes}),'Storage upload');}
   const result=await checked(await api(url),'Storage verification'),copied=Buffer.from(await result.arrayBuffer());
   if(hash(copied)!==hash(bytes)||copied.length!==object.size||result.headers.get('content-type')?.split(';')[0]!==mime.split(';')[0])throw new Error('Target checksum, length or content type mismatch');
   Object.assign(entry,{sha256:hash(bytes),contentType:mime,verified:true});
  }
  manifest.objects.push(entry);
  console.log(JSON.stringify({phase:copy?'copy-and-verify':'inventory',completed:manifest.objects.length,total:objects.length}));
 }
 const final=await inventory(),fingerprint=items=>JSON.stringify([...items].sort((a,b)=>a.key.localeCompare(b.key)).map(o=>[o.key,o.size,o.etag]));
 if(fingerprint(final)!==fingerprint(objects))throw Error('Original R2 inventory changed during migration; rerun before cutover');
 manifest.sourceRechecked=true;
 manifest.verified=copy&&manifest.objects.every(o=>o.verified);await mkdir('.local/migration',{recursive:true,mode:0o700});await writeFile('.local/migration/media-manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});
 console.log(JSON.stringify({sourceCount:objects.length,requiredReferences:refs.size,copied:manifest.objects.filter(o=>o.verified).length,verified:manifest.verified}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
