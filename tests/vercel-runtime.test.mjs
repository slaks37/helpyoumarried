import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {runtime} from './support/runtime.mjs';
import {createVercelHandler} from '../server/vercel.js';
import {createStorage} from '../server/storage.js';

test('Vercel owns token exchange, signed admin sessions, RSVP persistence and event restrictions',async()=>{
 const s=await runtime();try{
  assert.equal((await s.call('/')).status,200);
  const headers=await s.login();
  const created=await s.call('/api/admin/invitations',{method:'POST',headers,body:{guestName:'Nina & Owen',slug:'nina-owen',seats:4,eventIds:['reception'],salutation:'bapak_ibu'}});
  assert.equal(created.status,201);const {sharePath}=await created.json();
  const redirect=await s.call(sharePath.replace('?','/?'));assert.equal(redirect.status,308);assert.equal(redirect.headers.get('Location'),sharePath);
  const exchanged=await s.call(sharePath);assert.equal(exchanged.status,303);assert.equal(exchanged.headers.get('Location'),'/nina-owen');
  const cookie=exchanged.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly; SameSite=Lax; Secure/);assert.doesNotMatch(cookie,/Domain=/);
  const guest={Cookie:cookie.split(';')[0]};
  const view=await (await s.call('/api/invitation/nina-owen',{headers:guest})).json();assert.equal(view.accessRequired,false);assert.equal(view.invitation.guestName,'Nina & Owen');assert.deepEqual(view.events.map(e=>e.id),['reception']);
  const input={responses:[{eventId:'reception',status:'attending',guestCount:3}],message:'Hadir'};
  for(let i=0;i<2;i++)assert.equal((await s.call('/api/invitation/nina-owen/rsvp',{method:'POST',headers:guest,body:input})).status,200);
  input.responses[0]={eventId:'reception',status:'declined',guestCount:0};assert.equal((await s.call('/api/invitation/nina-owen/rsvp',{method:'POST',headers:guest,body:input})).status,200);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM responses').get().n,1);assert.equal(s.DB.sqlite.prepare('SELECT status FROM responses').get().status,'declined');
  input.responses[0]={eventId:'ceremony',status:'attending',guestCount:1};assert.equal((await s.call('/api/invitation/nina-owen/rsvp',{method:'POST',headers:guest,body:input})).status,400);
  assert.equal((await s.call('/api/admin/invitations',{headers:guest})).status,401);
  assert.equal((await s.call('/admin',{headers})).status,200);
  const logout=await s.call('/admin/signout',{headers});assert.equal(logout.headers.get('Location'),'/');assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
 }finally{await s.close();}
});
test('Vercel drops forged owner headers and never serves a private HTML file directly',async()=>{
 const s=await runtime();try{
  const forged={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com','cf-connecting-ip':'forged'};
  assert.equal((await s.call('/api/admin/invitations',{headers:forged})).status,401);
  for(const path of ['/wedding-desk-shell.html','/../wedding-desk-shell.html','/api/does-not-exist']){const r=await s.call(path,{rewritten:false});assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/OUR FAVORITE PEOPLE/);}
  const page=await s.call('/admin.html');assert.match(await page.text(),/admin-code-form/);
  const cross=await s.call('/api/admin/login',{method:'POST',headers:{Origin:'https://evil.test','sec-fetch-site':'cross-site'},body:{code:s.environment.ADMIN_ACCESS_CODE}});assert.equal(cross.status,403);
  const duplicate=await s.handle(new Request('https://wedding.test/api/backend?__route=/admin&__route=/api/admin/invitations'));assert.equal(duplicate.status,400);
 }finally{await s.close();}
});
test('Vercel ignores D1, R2 and asset bindings even when environment objects contain them',async()=>{
 let touched=false;const handler=createVercelHandler({environment:()=>({DB:{prepare(){touched=true;}},BUCKET:{get(){touched=true;}},ASSETS:{fetch(){touched=true;}},SUPABASE_DB_ENABLED:'false'}),pages:{fetch:async()=>new Response('Local page')}});
 const response=await handler(new Request('https://wedding.test/api/content'));assert.equal(response.status,503);assert.equal(touched,false);assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('signed uploads retain 8 MB images, verify bytes, and keep gift proofs admin-only',async()=>{
 const s=await runtime();try{
  const headers=await s.login(),bytes=new Uint8Array(5000000);bytes.set([137,80,78,71,13,10,26,10]);
  const start=await s.call('/api/uploads',{method:'POST',headers,body:{kind:'photo',mime:'image/png',size:bytes.length}});assert.equal(start.status,201);const ticket=await start.json(),url=new URL(ticket.url),stage=url.pathname.split('/wedding-staging/')[1];
  assert.equal((await s.call('/media/'+stage)).status,404);await s.storage.put(stage,bytes);
  assert.equal((await s.call('/api/uploads/complete',{method:'POST',body:{ticket:ticket.ticket}})).status,401);
  const completed=await s.call('/api/uploads/complete',{method:'POST',headers,body:{ticket:ticket.ticket}});assert.equal(completed.status,201);const photo=await completed.json();assert.equal((await s.call(photo.src)).status,200);assert.equal(s.files.has(stage),false);
  const retry=await s.call('/api/uploads/complete',{method:'POST',headers,body:{ticket:ticket.ticket}});assert.equal(retry.status,201);assert.equal((await retry.json()).src,photo.src);
  const made=await s.call('/api/admin/invitations',{method:'POST',headers,body:{guestName:'Proof guest',slug:'proof-guest',seats:2,eventIds:['reception']}});const inv=await made.json();
  const exchange=await s.call(inv.sharePath),guest={Cookie:exchange.headers.get('Set-Cookie').split(';')[0]},proof=new Uint8Array(100);proof.set([37,80,68,70,45]);
  const p=await (await s.call('/api/uploads',{method:'POST',headers:guest,body:{kind:'proof',slug:'proof-guest',mime:'application/pdf',size:100}})).json();await s.storage.put(new URL(p.url).pathname.split('/wedding-staging/')[1],proof);
  const verified=await (await s.call('/api/uploads/complete',{method:'POST',headers:guest,body:{ticket:p.ticket}})).json();
  const gift=await s.call('/api/invitation/proof-guest/gift',{method:'POST',headers:guest,body:{kind:'transfer',requestId:'signed-proof-request',proofTicket:verified.proofTicket}});assert.equal(gift.status,201);
  const row=s.DB.sqlite.prepare('SELECT * FROM gifts').get();assert.match(row.proof_key,/^gift-proofs\//);assert.equal((await s.call('/media/'+row.proof_key)).status,404);
  assert.equal((await s.call('/api/admin/gifts/'+row.id+'/proof',{headers:guest})).status,401);assert.equal((await s.call('/api/admin/gifts/'+row.id+'/proof',{headers})).status,200);
 }finally{await s.close();}
});
test('invalid and tampered upload tickets cannot publish a file',async()=>{
 const s=await runtime();try{
  const headers=await s.login();assert.equal((await s.call('/api/uploads',{method:'POST',headers,body:{kind:'photo',mime:'image/png',size:8000001}})).status,400);
  const p=await (await s.call('/api/uploads',{method:'POST',headers,body:{kind:'photo',mime:'image/png',size:100}})).json();
  assert.equal((await s.call('/api/uploads/complete',{method:'POST',headers,body:{ticket:p.ticket+'bad'}})).status,403);
  const stage=new URL(p.url).pathname.split('/wedding-staging/')[1];await s.storage.put(stage,new Uint8Array(100));
  assert.equal((await s.call('/api/uploads/complete',{method:'POST',headers,body:{ticket:p.ticket}})).status,415);assert.equal(s.files.size,0);
 }finally{await s.close();}
});
test('Supabase Storage uses separate private buckets, fixed project URLs and server-only credentials',async()=>{
 const calls=[],key='00000000-0000-4000-a000-000000000001.png';
 const bucket=createStorage({SUPABASE_URL:'https://lgwrwymrjcptoztjvbxz.supabase.co',SUPABASE_STORAGE_KEY:'server-only-test-key'},async(url,options)=>{calls.push({url,options});return options.method==='POST'?new Response('{}'):new Response(new Uint8Array([1,2,3]));});
 await bucket.put(key,new Uint8Array([1]),{httpMetadata:{contentType:'image/png'}});await bucket.get('gift-proofs/'+key);await bucket.delete(key);
 assert.match(calls[0].url,/\/wedding-gallery\//);assert.match(calls[1].url,/\/wedding-private\/gift-proofs\//);assert.equal(calls[0].options.headers.get('apikey'),'server-only-test-key');assert.equal(calls[0].options.redirect,'error');
 await assert.rejects(()=>bucket.get('../private.pdf'));await assert.rejects(()=>createStorage({SUPABASE_URL:'https://evil.test',SUPABASE_STORAGE_KEY:'secret'}).get(key));
});
test('build output and production source have no Sites host, D1 deployment files or exposed admin HTML',async()=>{
 for(const file of ['vercel.json','scripts/build.mjs','api/backend.js','server/vercel.js','server/storage.js','worker/index.js'])assert.doesNotMatch(await readFile(file,'utf8'),/chatgpt\.site|\.openai\/hosting/);
 const pages=await readdir('dist/client');assert.equal(pages.includes('wedding-desk-shell.html'),false);assert.equal(pages.includes('admin-login.html'),false);assert.equal(pages.includes('admin.html'),false);
 assert.ok((await readdir('dist/server-assets')).includes('wedding-desk-shell.html'));assert.equal((await readdir('dist')).includes('.openai'),false);
});
