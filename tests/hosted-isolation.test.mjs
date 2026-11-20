import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';import {createHash} from 'node:crypto';
import {APPLICATION_TABLES,credentialScope,scopedSql} from '../supabase/functions/wedding-db/scopes.js';
import {storageGateway} from '../supabase/functions/wedding-storage/handler.js';import {createStorage} from '../server/storage.js';
test('preview transport qualifies every allowlisted application table and keeps legacy SQL unchanged',async()=>{
 const context={};runInNewContext((await readFile('supabase/functions/wedding-db/allowlist.ts','utf8')).replace('export const ALLOWED_SQL','const ALLOWED_SQL')+';this.sql=[...ALLOWED_SQL]',context);
 for(const sql of context.sql){assert.equal(scopedSql(sql,'public'),sql);const transformed=scopedSql(sql,'wedding_preview');for(const table of APPLICATION_TABLES)assert.doesNotMatch(transformed,new RegExp('\\b(?:FROM|JOIN|INTO|UPDATE)\\s+'+table+'\\b','i'));}
 const rows=[{name:'sites-worker',token_hash:'a'.repeat(64)},{name:'vercel-preview',token_hash:'b'.repeat(64)},{name:'vercel-runtime',token_hash:'c'.repeat(64)}];assert.equal(credentialScope(rows,'a'.repeat(64)),'public');assert.equal(credentialScope(rows,'b'.repeat(64)),'wedding_preview');assert.equal(credentialScope(rows,'d'.repeat(64)),null);assert.throws(()=>scopedSql('SELECT * FROM invitations','other'));
});
test('scoped Storage gateway rejects anonymous calls, forces private buckets, and separates preview objects',async()=>{
 const token='wedding_storage_preview_'+'b'.repeat(64),runtime='wedding_storage_'+'a'.repeat(64),hash=s=>createHash('sha256').update(s).digest('hex'),seen=[];
 const handler=storageGateway({url:'https://lgwrwymrjcptoztjvbxz.supabase.co',serviceKey:'internal-service-role-never-returned',tokenHashes:{preview:hash(token),runtime:hash(runtime)},fetcher:async(url,options)=>{seen.push({url,options});if(url.includes('/upload/sign/'))return Response.json({url:'/object/upload/sign/wedding-qa-staging/staging/photos/'+'a'.repeat(36)+'.jpg?token=scoped-test-only'});return new Response('ok');}});
 const call=(path,method='GET',body,key=token)=>handler(new Request('https://lgwrwymrjcptoztjvbxz.supabase.co/functions/v1/wedding-storage'+path,{method,headers:{'x-wedding-storage-token':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await call('/bucket/wedding-gallery','GET',null,'')).status,401);assert.equal((await call('/bucket','POST',{id:'wedding-gallery',public:true})).status,400);assert.equal(seen.length,0);
 assert.equal((await call('/bucket/wedding-gallery')).status,200);assert.match(seen[0].url,/bucket\/wedding-qa-gallery$/);
 assert.equal((await call('/object/wedding-private','DELETE',{prefixes:['gift-proofs/'+'a'.repeat(36)+'.pdf']})).status,200);assert.match(seen.at(-1).url,/wedding-qa-private$/);
 assert.equal((await call('/object/wedding-gallery/bad.html','POST',{})).status,400);
 const storage=createStorage({SUPABASE_URL:'https://lgwrwymrjcptoztjvbxz.supabase.co',SUPABASE_STORAGE_KEY:token},(url,options)=>handler(new Request(url,options)));
 const signed=await storage.createSignedUpload('staging/photos/'+'a'.repeat(36)+'.jpg');assert.match(signed,/storage\/v1\/object\/upload\/sign\/wedding-qa-staging\//);assert.ok(!signed.includes(token));assert.ok(!signed.includes('internal-service-role'));
 assert.equal((await call('/bucket/wedding-gallery','GET',null,runtime)).status,200);assert.match(seen.at(-1).url,/bucket\/wedding-gallery$/);
});
