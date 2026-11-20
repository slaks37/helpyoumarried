import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {tmpdir} from 'node:os';
import path from 'node:path';
import worker,{DEFAULT_EVENTS} from '../worker/index.js';
import {createLocalDB} from '../scripts/local-db.mjs';
const owner={'oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':'owner@example.com'};
async function fixture(){const DB=await createLocalDB();const mediaFiles=new Map();const BUCKET={async delete(key){mediaFiles.delete(key);},async put(key,bytes){mediaFiles.set(key,new Uint8Array(bytes));},async get(key){const bytes=mediaFiles.get(key);return bytes?{body:new Response(bytes).body}:null;}};const env={DB,BUCKET,ADMIN_EMAIL:'owner@example.com',ADMIN_SESSION_SECRET:'test-only-secret-with-32-random-bytes',ADMIN_ACCESS_CODE:'local-wedding-test-code-123456',ASSETS:{fetch:async()=>new Response('<html>Invitation</html>',{headers:{'Content-Type':'text/html'}})}};const call=async(route,{method='GET',body,headers={}}={})=>worker.fetch(new Request('https://wedding.test'+route,{method,headers:{...headers,...(body?{'Content-Type':'application/json',Origin:'https://wedding.test'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{});return {DB,env,call};}
async function create(call,overrides={}){const r=await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Pak Rudolf',slug:'rudolf',seats:2,eventIds:['ceremony','reception'],phone:'',privateNote:'Hanya admin',...overrides}});assert.equal(r.status,201);return r.json();}
async function guest(call,sharePath){const exchange=await call(sharePath);assert.equal(exchange.status,303);assert.equal(exchange.headers.get('location'),'/rudolf');const cookie=exchange.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);return {Cookie:cookie.split(';')[0]};}
test('admin access is denied to anonymous, other accounts, and missing owner configuration',async()=>{const {DB,env,call}=await fixture();try{assert.equal((await call('/api/admin/invitations')).status,401);assert.equal((await call('/api/admin/invitations',{headers:{...owner,'oai-authenticated-user-email':'other@example.com'}})).status,403);env.ADMIN_EMAIL='';assert.equal((await call('/api/admin/invitations',{headers:owner})).status,403);}finally{DB.close();}});
test('personal links preserve clean slugs and protect guest data from guessing',async()=>{const {DB,call}=await fixture();try{const created=await create(call);const publicView=await (await call('/api/invitation/rudolf')).json();assert.equal(publicView.invitation.guestName,'Pak Rudolf');assert.equal(publicView.accessRequired,true);assert.equal(publicView.responses.length,0);assert.equal(publicView.events.length,2);assert.equal((await call('/api/invitation/rudolf/rsvp',{method:'POST',body:{responses:[]}})).status,403);assert.equal((await call('/rudolf?key=wrong')).status,403);const headers=await guest(call,created.sharePath);const response=await call('/api/invitation/rudolf',{headers});assert.equal(response.status,200);const info=await response.json();assert.equal(info.invitation.guestName,'Pak Rudolf');assert.equal(info.invitation.privateNote,undefined);assert.equal(info.invitation.access_token,undefined);assert.equal((await call('/rudolf/')).status,308);assert.match(response.headers.get('cache-control'),/no-store/);}finally{DB.close();}});
test('view tracking is deduplicated, excludes admin preview, and never counts link GETs',async()=>{const {DB,call}=await fixture();try{const created=await create(call);const headers=await guest(call,created.sharePath);await call('/rudolf',{headers});let row=await DB.prepare('SELECT open_count FROM invitations').first();assert.equal(row.open_count,0);for(let i=0;i<2;i++)assert.equal((await call('/api/invitation/rudolf/opened',{method:'POST',headers,body:{visitId:'same-visit-id-0001'}})).status,200);await call('/api/invitation/rudolf/opened',{method:'POST',headers:owner,body:{visitId:'admin-visit-id-0001'}});row=await DB.prepare('SELECT open_count,first_opened_at,last_opened_at FROM invitations').first();assert.equal(row.open_count,1);assert.ok(row.first_opened_at);assert.equal(row.first_opened_at,row.last_opened_at);}finally{DB.close();}});
test('RSVP validates assigned events and capacity, updates existing answers, and supports decline',async()=>{const {DB,call}=await fixture();try{const created=await create(call),headers=await guest(call,created.sharePath);const valid={message:'Sampai jumpa!',responses:[{eventId:'ceremony',status:'attending',guestCount:2},{eventId:'reception',status:'declined',guestCount:0}]};assert.equal((await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:{...valid,responses:[{...valid.responses[0],guestCount:3},valid.responses[1]]}})).status,400);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM responses').first()).n,0);const submitted=await (await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:valid})).json();assert.equal(submitted.saved,true);assert.deepEqual(submitted.responses.map(r=>[r.event_id,r.status,r.guest_count]),[['ceremony','attending',2],['reception','declined',0]]);valid.responses[0].guestCount=1;assert.equal((await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:valid})).status,200);const rows=(await DB.prepare('SELECT * FROM responses').all()).results;assert.equal(rows.length,2);assert.equal(rows.find(r=>r.event_id==='ceremony').guest_count,1);assert.equal(rows.find(r=>r.event_id==='reception').status,'declined');const admin=(await (await call('/api/admin/invitations',{headers:owner})).json()).responses;assert.equal(admin.find(r=>r.event_id==='ceremony').status,'attending');assert.equal((await call('/api/invitation/rudolf/rsvp',{method:'POST',headers:owner,body:valid})).status,403);}finally{DB.close();}});
test('gifts are idempotent and only the admin can verify them',async()=>{const {DB,call}=await fixture();try{const created=await create(call),headers=await guest(call,created.sharePath);const gift={requestId:'gift-request-0001',kind:'transfer',amount:500000,note:'Test gift'};for(let i=0;i<2;i++)assert.equal((await call('/api/invitation/rudolf/gift',{method:'POST',headers,body:gift})).status,201);const rows=(await DB.prepare('SELECT * FROM gifts').all()).results;assert.equal(rows.length,1);assert.equal(rows[0].status,'reported');assert.equal((await call('/api/admin/gifts/'+rows[0].id,{method:'PATCH',headers,body:{status:'confirmed'}})).status,401);assert.equal((await call('/api/admin/gifts/'+rows[0].id,{method:'PATCH',headers:owner,body:{status:'confirmed'}})).status,200);await call('/api/invitation/rudolf/gift',{method:'POST',headers,body:gift});const row=await DB.prepare('SELECT * FROM gifts').first();assert.equal(row.status,'confirmed');assert.ok(row.verified_at);}finally{DB.close();}});
test('cross-origin mutations, reserved slugs, and duplicate slugs are rejected',async()=>{const {DB,env,call}=await fixture();try{await create(call);assert.equal((await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Other',slug:'rudolf',seats:2,eventIds:['ceremony']}})).status,409);assert.equal((await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Other',slug:'admin',seats:2,eventIds:['ceremony']}})).status,400);const r=await worker.fetch(new Request('https://wedding.test/api/admin/gifts',{method:'POST',headers:{...owner,'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'}),env,{});assert.equal(r.status,403);const proxied=await worker.fetch(new Request('https://wedding.test/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://stefen-jessica-forever.site','Sec-Fetch-Site':'same-origin'},body:JSON.stringify({code:'local-wedding-test-code-123456'})}),env,{});assert.equal(proxied.status,200);const forged=await worker.fetch(new Request('https://wedding.test/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://stefen-jessica-forever.site','Sec-Fetch-Site':'cross-site'},body:JSON.stringify({code:'local-wedding-test-code-123456'})}),env,{});assert.equal(forged.status,403);}finally{DB.close();}});
test('revoked invitations stop working even when an old guest cookie remains',async()=>{const {DB,call}=await fixture();try{const created=await create(call),headers=await guest(call,created.sharePath);const i=created.invitation;assert.equal((await call('/api/admin/invitations/'+i.id,{method:'PATCH',headers:owner,body:{guestName:i.guestName,seats:2,eventIds:i.eventIds,active:false}})).status,200);assert.equal((await call('/api/invitation/rudolf',{headers})).status,404);assert.equal((await call(created.sharePath)).status,404);}finally{DB.close();}});
test('database records survive a server restart',async()=>{const directory=await mkdtemp(path.join(tmpdir(),'sj-db-test-'));try{const filename=path.join(directory,'test.sqlite');let DB=await createLocalDB(filename);await DB.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)').bind('test','persistent',new Date().toISOString()).run();DB.close();DB=await createLocalDB(filename);assert.equal((await DB.prepare('SELECT value FROM settings WHERE key=?').bind('test').first()).value,'persistent');DB.close();}finally{await rm(directory,{recursive:true,force:true});}});

test('event edits persist and reject impossible calendar dates',async()=>{const {DB,call}=await fixture();try{const events=structuredClone(DEFAULT_EVENTS);events[2].start='2026-12-19T12:00:00+07:00';assert.equal((await call('/api/admin/events',{method:'PUT',headers:owner,body:{events}})).status,200);const saved=await (await call('/api/events')).json();assert.equal(saved.events[2].start,events[2].start);events[2].date='2026-02-31';assert.equal((await call('/api/admin/events',{method:'PUT',headers:owner,body:{events}})).status,400);}finally{DB.close();}});

test('guest hearts are counted per invitation and visible only to admin',async()=>{const {DB,call}=await fixture();try{const created=await create(call),headers=await guest(call,created.sharePath);assert.equal((await call('/api/invitation/rudolf/heart',{method:'POST',body:{}})).status,403);assert.equal((await call('/api/invitation/rudolf/heart',{method:'POST',headers:owner,body:{}})).status,403);for(let count=1;count<=3;count++){const response=await call('/api/invitation/rudolf/heart',{method:'POST',headers,body:{}});assert.equal(response.status,200);assert.equal((await response.json()).heartCount,count);}const admin=await (await call('/api/admin/invitations',{headers:owner})).json();assert.equal(admin.invitations[0].heartCount,3);assert.ok(admin.invitations[0].lastHeartAt);const guestView=await (await call('/api/invitation/rudolf')).json();assert.equal(guestView.invitation.heartCount,undefined);}finally{DB.close();}});

test('reception tables validate ranges and follow the assigned invitation',async()=>{const {DB,call}=await fixture();try{const invalid=await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Tamu Galilea',slug:'tamu-galilea',seats:2,eventIds:['reception'],receptionTable:'Galilea-6'}});assert.equal(invalid.status,400);const created=await create(call,{eventIds:['reception'],receptionTable:'Galilea-5'});assert.equal(created.invitation.receptionTable,'Galilea-5');const locked=await (await call('/api/invitation/rudolf')).json();assert.equal(locked.invitation.receptionTable,undefined);const headers=await guest(call,created.sharePath),authorized=await (await call('/api/invitation/rudolf',{headers})).json();assert.equal(authorized.invitation.receptionTable,'Galilea-5');const edit=await call('/api/admin/invitations/'+created.invitation.id,{method:'PATCH',headers:owner,body:{guestName:'Pak Rudolf',seats:2,eventIds:['reception'],receptionTable:'Jordan-10',active:true}});assert.equal(edit.status,200);assert.equal((await edit.json()).invitation.receptionTable,'Jordan-10');const clear=await call('/api/admin/invitations/'+created.invitation.id,{method:'PATCH',headers:owner,body:{guestName:'Pak Rudolf',seats:2,eventIds:['ceremony'],receptionTable:'Jordan-10',active:true}});assert.equal(clear.status,200);assert.equal((await clear.json()).invitation.receptionTable,'');}finally{DB.close();}});

test('CMS keeps edited copy and gallery across requests, and restricts image upload to the owner',async()=>{const {DB,env,call}=await fixture();try{
 const context={window:{}};runInNewContext(await readFile('public/content-defaults.js','utf8'),context);const content=JSON.parse(JSON.stringify(context.window.WEDDING_CONTENT_DEFAULTS));
 content.texts.memoHeadingAccent='favourite people list — special.';content.texts.rsvpHeading='Kami tunggu kabarmu,';content.texts.galleryMore='Buka semua kenangan';content.texts.giftBankNumber='0001112223';content.photos[0].caption='A new chapter';content.photos.at(-1).caption='Our sunset walk';content.featured.hero=[24,21,2];
 assert.equal((await call('/api/admin/content',{method:'PUT',body:{content}})).status,401);
 const saved=await call('/api/admin/content',{method:'PUT',headers:owner,body:{content}});assert.equal(saved.status,200);
 const publicContent=await (await call('/api/content')).json();assert.equal(publicContent.content.texts.memoHeadingAccent,'favourite people list — special.');assert.equal(publicContent.content.texts.rsvpHeading,'Kami tunggu kabarmu,');assert.equal(publicContent.content.texts.galleryMore,'Buka semua kenangan');assert.equal(publicContent.content.texts.giftBankNumber,'0001112223');assert.equal(publicContent.content.photos.length,24);assert.equal(publicContent.content.photos[0].caption,'A new chapter');assert.equal(publicContent.content.photos.at(-1).caption,'Our sunset walk');assert.deepEqual(publicContent.content.featured.hero,[24,21,2]);
 content.photos[0].src='https://evil.example/a.jpg';assert.equal((await call('/api/admin/content',{method:'PUT',headers:owner,body:{content}})).status,400);
 const bytes=new Uint8Array(128);bytes.set([137,80,78,71,13,10,26,10]);const form=new FormData();form.append('file',new File([bytes],'photo.png',{type:'image/png'}));
 const uploadRequest=(headers={})=>worker.fetch(new Request('https://wedding.test/api/admin/media',{method:'POST',headers:{...headers,Origin:'https://wedding.test'},body:form}),env,{});
 assert.equal((await uploadRequest()).status,401);const uploaded=await uploadRequest(owner);assert.equal(uploaded.status,201);const info=await uploaded.json();assert.match(info.src,/^\/media\/[a-f0-9-]{36}\.png$/);const image=await call(info.src);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal((await image.arrayBuffer()).byteLength,128);
}finally{DB.close();}});

test('every CMS text field has a default and a visitor-facing binding',async()=>{
 const context={window:{}};runInNewContext(await readFile('public/content-defaults.js','utf8'),context);
 const fields=context.window.WEDDING_TEXT_FIELDS,keys=fields.map(field=>field.key);
 assert.equal(new Set(keys).size,keys.length);
 const [html,app,guest]=await Promise.all(['public/index.html','public/app.js','public/guest.js'].map(file=>readFile(file,'utf8')));
 for(const key of keys){assert.equal(typeof context.window.WEDDING_CONTENT_DEFAULTS.texts[key],'string',`${key} has no default`);assert.ok(html.includes(`data-cms="${key}"`)||html.includes(`data-cms-placeholder="${key}"`)||app.includes(`'${key}'`)||guest.includes(`'${key}'`),`${key} is not displayed`);}
 assert.doesNotMatch(html,/id="(?:guest-name|memo-recipient)"\s+data-cms=/);
});

test('private admin code starts a signed session without platform identity headers',async()=>{const {DB,call}=await fixture();try{assert.equal((await call('/api/admin/login',{method:'POST',body:{code:'wrong-admin-code-of-adequate-length'}})).status,401);const logged=await call('/api/admin/login',{method:'POST',body:{code:'local-wedding-test-code-123456'}});assert.equal(logged.status,200);const cookie=logged.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.doesNotMatch(cookie,/local-wedding-test-code/);const headers={Cookie:cookie.split(';')[0]};assert.equal((await call('/api/admin/session',{headers})).status,200);assert.equal((await call('/api/admin/invitations',{headers})).status,200);const page=await call('/admin',{headers});assert.equal(page.status,200);assert.match(await page.text(),/Invitation/);}finally{DB.close();}});


test('each personal invitation exposes only its assigned event and stored display name',async()=>{const {DB,call}=await fixture();try{for(const [slug,name,eventId] of [['triyono-ribka','Triyono & Ribka','ceremony'],['resepsi-saja','Keluarga Resepsi','reception'],['griya-saja','Sahabat Griya','celebration']]){await create(call,{slug,guestName:name,eventIds:[eventId]});const result=await (await call('/api/invitation/'+slug)).json();assert.equal(result.invitation.guestName,name);assert.deepEqual(result.invitation.eventIds,[eventId]);assert.deepEqual(result.events.map(e=>e.id),[eventId]);assert.equal(result.accessRequired,true);assert.equal(result.responses.length,0);}}finally{DB.close();}});

test('guest transfer proof is stored privately and visible only to admin',async()=>{const {DB,env,call}=await fixture();try{const created=await create(call),headers=await guest(call,created.sharePath);const form=new FormData(),bytes=new Uint8Array(128);bytes.set([37,80,68,70,45]);form.set('requestId','proof-request-0001');form.set('kind','transfer');form.set('amount','250000');form.set('note','Dari Triyono');form.set('proof',new File([bytes],'bukti.pdf',{type:'application/pdf'}));const submit=()=>worker.fetch(new Request('https://wedding.test/api/invitation/rudolf/gift',{method:'POST',headers:{...headers,Origin:'https://wedding.test'},body:form}),env,{});assert.equal((await submit()).status,201);assert.equal((await submit()).status,201);const rows=(await DB.prepare('SELECT * FROM gifts').all()).results;assert.equal(rows.length,1);assert.equal(rows[0].amount,250000);assert.match(rows[0].proof_key,/^gift-proofs\/[a-f0-9-]{36}\.pdf$/);const proofPath='/api/admin/gifts/'+rows[0].id+'/proof';assert.equal((await call(proofPath)).status,401);assert.equal((await call(proofPath,{headers})).status,401);const proof=await call(proofPath,{headers:owner});assert.equal(proof.status,200);assert.equal(proof.headers.get('content-type'),'application/pdf');assert.match(proof.headers.get('cache-control'),/no-store/);assert.equal((await proof.arrayBuffer()).byteLength,128);assert.equal((await call('/media/'+rows[0].proof_key)).status,404);const invalid=new FormData();invalid.set('requestId','invalid-proof-0002');invalid.set('kind','transfer');invalid.set('amount','1000');invalid.set('note','');invalid.set('proof',new File([new Uint8Array(128)],'bad.pdf',{type:'application/pdf'}));const rejected=await worker.fetch(new Request('https://wedding.test/api/invitation/rudolf/gift',{method:'POST',headers:{...headers,Origin:'https://wedding.test'},body:invalid}),env,{});assert.equal(rejected.status,415);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM gifts').first()).n,1);assert.equal((await call('/api/admin/invitations',{headers:owner})).status,200);}finally{DB.close();}});

test('editing a guest name and assigned event immediately updates the personal invitation',async()=>{const {DB,call}=await fixture();try{const created=await create(call,{slug:'triyono-ribka',guestName:'Triyono & Ribka',eventIds:['ceremony']});const invitation=created.invitation;const edit=await call('/api/admin/invitations/'+invitation.id,{method:'PATCH',headers:owner,body:{guestName:'Keluarga Triyono & Ribka',seats:2,eventIds:['celebration'],active:true}});assert.equal(edit.status,200);const result=await (await call('/api/invitation/triyono-ribka')).json();assert.equal(result.invitation.guestName,'Keluarga Triyono & Ribka');assert.deepEqual(result.events.map(event=>event.id),['celebration']);assert.equal((await call('/api/invitation/triyono-ribka/rsvp',{method:'POST',body:{responses:[]}})).status,403);}finally{DB.close();}});

test('each reception table holds at most ten allocated seats',async()=>{const {DB,call}=await fixture();try{
 const first=await create(call,{seats:8,eventIds:['reception'],receptionTable:'Galilea-1'});
 const post=(slug,seats)=>call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:slug,slug,seats,eventIds:['reception'],receptionTable:'Galilea-1'}});
 assert.equal((await post('second-guest',3)).status,409);
 assert.equal((await post('second-guest',2)).status,201);
 assert.equal((await post('third-guest',1)).status,409);
 const edit=await call('/api/admin/invitations/'+first.invitation.id,{method:'PATCH',headers:owner,body:{guestName:'Pak Rudolf',seats:9,eventIds:['reception'],receptionTable:'Galilea-1',active:true}});assert.equal(edit.status,409);
 assert.equal((await call('/api/admin/invitations/'+first.invitation.id,{method:'PATCH',headers:owner,body:{guestName:'Pak Rudolf',seats:8,eventIds:['reception'],receptionTable:'Galilea-1',active:false}})).status,200);
 assert.equal((await post('third-guest',8)).status,201);
 assert.equal((await DB.prepare("SELECT SUM(seats) AS seats FROM invitations WHERE reception_table = ? AND active = 1").bind('Galilea-1').first()).seats,10);
}finally{DB.close();}});

test('bulk invitations validate duplicates and table seats before any row is written',async()=>{const {DB,call}=await fixture();try{
 const upload=invitations=>call('/api/admin/invitations/bulk',{method:'POST',headers:owner,body:{invitations}});
 const rows=[{guestName:'Ana',slug:'ana',seats:6,eventIds:['reception'],receptionTable:'Jordan-1'},{guestName:'Budi',slug:'budi',seats:5,eventIds:['reception'],receptionTable:'Jordan-1'}];
 assert.equal((await upload(rows)).status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM invitations').first()).n,0);
 rows[1].seats=4;const result=await upload(rows);assert.equal(result.status,201);const created=(await result.json()).created;assert.equal(created.length,2);assert.match(created[0].sharePath,/^\/ana\?key=/);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM invitations').first()).n,2);
 assert.equal((await upload([{...rows[0],slug:'new-name'},{...rows[1],slug:'new-name'}])).status,409);
 assert.equal((await upload([{...rows[0],slug:'another-name'}])).status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM invitations').first()).n,2);
 assert.equal((await upload(Array.from({length:51},(_,index)=>({...rows[0],slug:'new-'+index,receptionTable:''})))).status,400);
}finally{DB.close();}});

test('reception II defaults to the requested address and map',()=>{assert.equal(DEFAULT_EVENTS[2].address,'');assert.equal(DEFAULT_EVENTS[2].mapsUrl,null);});

test('admin can set and edit single or paired salutations without changing guest names or slugs',async()=>{const {DB,call}=await fixture();try{const created=await create(call,{guestName:'Triyono & Ribka',slug:'triyono-ribka',salutation:'bapak_ibu',eventIds:['celebration']});assert.equal(created.invitation.salutation,'bapak_ibu');const publicView=(await (await call('/api/invitation/triyono-ribka')).json()).invitation;assert.equal(publicView.guestName,'Triyono & Ribka');assert.equal(publicView.salutation,'bapak_ibu');const edited=await call('/api/admin/invitations/'+created.invitation.id,{method:'PATCH',headers:owner,body:{guestName:'Triyono & Ribka',salutation:'tuan_nyonya',seats:2,eventIds:['celebration'],active:true}});assert.equal(edited.status,200);assert.equal((await edited.json()).invitation.salutation,'tuan_nyonya');assert.equal((await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Invalid',slug:'invalid',salutation:'king',seats:1,eventIds:['ceremony']}})).status,400);}finally{DB.close();}});

test('paired salutations address both guests in Indonesian and English',async()=>{const context={window:{}};runInNewContext(await readFile('public/salutations.js','utf8'),context);const invite={guestName:'Triyono & Ribka',salutation:'bapak_ibu'};assert.equal(context.window.weddingDisplayName(invite,'id'),'Bapak Triyono & Ibu Ribka');assert.equal(context.window.weddingDisplayName(invite,'en'),'Mr. Triyono & Mrs. Ribka');invite.salutation='tuan_nyonya';assert.equal(context.window.weddingDisplayName(invite,'id'),'Tuan Triyono & Nyonya Ribka');assert.equal(context.window.weddingAddress(invite),'Tuan dan Nyonya');});

test('RSVP lives in section five and the calendar is hidden until attendance is confirmed',async()=>{const html=await readFile('public/index.html','utf8');assert.doesNotMatch(html,/id="confirm-attendance"/);assert.match(html,/id="rsvp-calendar" hidden/);assert.match(html,/id="rsvp-form" hidden/);});

test('a configured six-digit admin code opens the CMS and wrong codes fail',async()=>{const {DB,env,call}=await fixture();try{env.ADMIN_ACCESS_CODE='654321';assert.equal((await call('/api/admin/login',{method:'POST',body:{code:'654321'}})).status,200);assert.equal((await call('/api/admin/login',{method:'POST',body:{code:'654322'}})).status,401);}finally{DB.close();}});

test('five wrong admin PIN attempts temporarily lock the same network without storing a raw IP',async()=>{const {DB,env,call}=await fixture();try{env.ADMIN_ACCESS_CODE='654321';const headers={'CF-Connecting-IP':'203.0.113.55'};for(let i=0;i<5;i++)assert.equal((await call('/api/admin/login',{method:'POST',headers,body:{code:'000000'}})).status,401);assert.equal((await call('/api/admin/login',{method:'POST',headers,body:{code:'654321'}})).status,429);const row=await DB.prepare('SELECT * FROM admin_login_attempts').first();assert.equal(row.failed_count,5);assert.notEqual(row.id,'203.0.113.55');assert.match(row.id,/^[a-f0-9]{64}$/);await DB.prepare('UPDATE admin_login_attempts SET updated_at=?').bind('2020-01-01T00:00:00.000Z').run();assert.equal((await call('/api/admin/login',{method:'POST',headers,body:{code:'654321'}})).status,200);}finally{DB.close();}});

test('visitor language follows network country without exposing or storing an IP address',async()=>{const {DB,env}=await fixture();try{
 const locale=async(country,origin)=>{const request=new Request('https://wedding.test/api/locale',{headers:{Origin:origin,'CF-IPCountry':country,'X-Forwarded-For':'203.0.113.8'}});return worker.fetch(request,env,{});};
 const indonesia=await locale('ID','https://stefen-jessica-forever.site');assert.equal((await indonesia.json()).language,'id');assert.equal(indonesia.headers.get('access-control-allow-origin'),'https://stefen-jessica-forever.site');
 const outside=await locale('US','https://stefen-jessica-forever.site');const body=await outside.text();assert.deepEqual(JSON.parse(body),{language:'en'});assert.doesNotMatch(body,/203\.0\.113\.8/);
 const unknown=await locale('XX','https://evil.example');assert.equal((await unknown.json()).language,'en');assert.equal(unknown.headers.get('access-control-allow-origin'),null);
}finally{DB.close();}});

test('English CMS copy and photo descriptions survive save and public read',async()=>{const {DB,call}=await fixture();try{
 const context={window:{}};runInNewContext(await readFile('public/content-defaults.js','utf8'),context);runInNewContext(await readFile('public/english-defaults.js','utf8'),context);
 const content=JSON.parse(JSON.stringify(context.window.WEDDING_CONTENT_DEFAULTS));content.textsEn=JSON.parse(JSON.stringify(context.window.WEDDING_ENGLISH_TEXTS));content.textsEn.rsvpIntro='Please let us know if you can make it.';content.photos[0].captionEn='A day to remember';content.photos[0].altEn='Stefen and Jessica together indoors';
 const saved=await call('/api/admin/content',{method:'PUT',headers:owner,body:{content}});assert.equal(saved.status,200);
 const publicContent=(await (await call('/api/content')).json()).content;assert.equal(publicContent.textsEn.rsvpIntro,'Please let us know if you can make it.');assert.equal(publicContent.photos[0].captionEn,'A day to remember');assert.equal(publicContent.photos[0].altEn,'Stefen and Jessica together indoors');
 delete content.textsEn.rsvpIntro;assert.equal((await call('/api/admin/content',{method:'PUT',headers:owner,body:{content}})).status,400);
}finally{DB.close();}});

test('public invitation omits the verse attribution and specifies one-hour calendar alarms',async()=>{const [html,app,defaults]=await Promise.all(['public/index.html','public/app.js','public/content-defaults.js'].map(file=>readFile(file,'utf8')));assert.doesNotMatch(html,/Terinspirasi|1 Korintus/i);assert.doesNotMatch(defaults,/quoteSignature/);assert.match(app,/'-PT1H'/);assert.match(html,/Google Calendar mungkin memakai pengingat bawaan/);});

async function visitor(call){const response=await call('/api/visitor');assert.equal(response.status,200);return {Cookie:response.headers.get('set-cookie').split(';')[0]};}
test('guestbook holds unsuitable messages privately, preserves originals, and deduplicates retries',async()=>{const {DB,call}=await fixture();try{
 const headers=await visitor(call),body={name:'A real guest',message:'fuck this wedding',requestId:'message-request-001'};
 assert.equal((await call('/api/messages',{method:'POST',body})).status,403);
 const saved=await call('/api/messages',{method:'POST',headers,body});assert.equal(saved.status,201);assert.equal((await saved.json()).message.original,body.message);
 assert.equal((await call('/api/messages',{method:'POST',headers,body})).status,201);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM guest_messages').first()).n,1);
 assert.equal((await DB.prepare('SELECT status FROM guest_messages').first()).status,'held');
 assert.equal((await (await call('/api/messages',{headers})).json()).messages.length,1);
 assert.equal((await (await call('/api/messages',{headers:await visitor(call)})).json()).messages.length,0);
 const admin=await (await call('/api/admin/messages',{headers:owner})).json();assert.equal(admin.messages.length,1);assert.equal(admin.messages[0].owner_hash,undefined);assert.equal(admin.messages[0].network_hash,undefined);
 assert.equal((await call('/api/admin/messages')).status,401);
}finally{DB.close();}});
test('message author comes from verified invitation, not a forged form name',async()=>{const {DB,call}=await fixture();try{
 const created=await create(call,{guestName:'Triyono & Ribka',salutation:'bapak_ibu'}),access=await guest(call,created.sharePath),browser=await visitor(call),headers={Cookie:access.Cookie+'; '+browser.Cookie};
 const response=await call('/api/messages',{method:'POST',headers,body:{slug:'rudolf',name:'Forged name',message:'Selamat berbahagia!',requestId:'personal-message-001'}});assert.equal(response.status,201);assert.equal((await response.json()).message.name,'Triyono & Ribka');
 assert.equal((await call('/api/messages',{method:'POST',headers:browser,body:{slug:'rudolf',name:'Forged',message:'Hi',requestId:'personal-message-002'}})).status,403);
 assert.equal((await call('/api/messages',{method:'POST',headers:browser,body:{name:' ',message:'Hi',requestId:'empty-name-001'}})).status,400);
}finally{DB.close();}});
test('guestbook pagination is fixed at twenty and excludes other senders held messages',async()=>{const {DB,call}=await fixture();try{
 for(let i=0;i<22;i++)await DB.prepare('INSERT INTO guest_messages (id,owner_hash,network_hash,request_id,guest_name,original,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(String(i).padStart(3,'0'),'different-owner','network',String(i),'Guest '+i,'Original '+i,i===21?'held':'published','2026-09-28T00:00:00Z','2026-09-28T00:00:00Z').run();
 const headers=await visitor(call),one=await (await call('/api/messages?page=1',{headers})).json(),two=await (await call('/api/messages?page=2',{headers})).json();assert.equal(one.messages.length,20);assert.equal(one.hasMore,true);assert.equal(two.messages.length,1);assert.equal(two.hasMore,false);assert.equal(new Set([...one.messages,...two.messages].map(m=>m.id)).size,21);
 assert.equal((await call('/api/messages?page=-1',{headers})).status,400);
 const publish=await call('/api/admin/messages/021',{method:'PATCH',headers:owner,body:{status:'published'}});assert.equal(publish.status,200);assert.equal((await (await call('/api/messages?page=2',{headers})).json()).messages.length,2);
}finally{DB.close();}});
test('general invitations accept, remember and expose RSVP to admins without assigning personal seats',async()=>{const {DB,call}=await fixture();try{
 const headers=await visitor(call),responses=[{eventId:'celebration',status:'attending',guestCount:2}];
 assert.equal((await call('/api/rsvp',{method:'POST',headers,body:{name:'Guest Public',responses:[{eventId:'ceremony',status:'attending',guestCount:2}]}})).status,400);
 const saved=await call('/api/rsvp',{method:'POST',headers,body:{name:'Guest Public',responses}});assert.equal(saved.status,200);assert.equal((await saved.json()).responses[0].guest_count,2);
 const recalled=await (await call('/api/visitor',{headers})).json();assert.equal(recalled.rsvp.name,'Guest Public');assert.equal(recalled.rsvp.responses[0].status,'attending');
 responses[0]={eventId:'celebration',status:'declined',guestCount:0};await call('/api/rsvp',{method:'POST',headers,body:{name:'Guest Public',responses}});
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM general_rsvps').first()).n,1);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM invitations').first()).n,0);
 const admin=await (await call('/api/admin/general-rsvps',{headers:owner})).json();assert.equal(admin.rsvps[0].responses[0].status,'declined');assert.equal((await call('/api/admin/general-rsvps')).status,401);
}finally{DB.close();}});


test('confirmed admin deletion removes the invitation and linked records, releases seats and revokes old links',async()=>{
 const {DB,env,call}=await fixture();try{
  const created=await create(call,{eventIds:['reception'],receptionTable:'Jordan-1',seats:10});
  const other=await create(call,{slug:'other-guest'}),headers=await guest(call,created.sharePath),invId=created.invitation.id,route='/api/admin/invitations/'+invId;
  await call('/api/invitation/rudolf/opened',{method:'POST',headers,body:{visitId:'delete-test-visit'}});
  await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:{responses:[{eventId:'reception',status:'attending',guestCount:10}]}});
  await call('/api/admin/gifts',{method:'POST',headers:owner,body:{invitationId:invId,requestId:'delete-test-gift',kind:'transfer',amount:100000,note:'',status:'confirmed'}});
  await call('/api/gift-activity',{method:'POST',headers,body:{slug:'rudolf',action:'opened',source:'floating',requestId:'delete-gift-activity'}});
  await call('/api/reading-progress',{method:'POST',headers,body:{slug:'rudolf',sessionId:'delete-reading-session',maxDepth:50,sectionsMask:9,lastSection:3,sequence:1}});
  const proof='gift-proofs/delete-test.pdf';await env.BUCKET.put(proof,new Uint8Array([1,2,3]));
  await DB.prepare('UPDATE gifts SET proof_key=? WHERE invitation_id=?').bind(proof,invId).run();
  await DB.prepare('INSERT INTO guest_messages (id,owner_hash,network_hash,request_id,invitation_id,guest_name,original,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind('delete-message','owner','network','delete-request',invId,'Rudolf','Best wishes','published','2026-10-08','2026-10-08').run();
  assert.equal((await call(route,{method:'DELETE',body:{slug:'rudolf'}})).status,401);
  assert.equal((await call(route,{method:'DELETE',headers,body:{slug:'rudolf'}})).status,401);
  assert.equal((await call(route,{method:'DELETE',headers:owner,body:{slug:'other-guest'}})).status,400);
  assert.equal((await call(route,{method:'DELETE',headers:owner})).status,415);
  assert.equal((await worker.fetch(new Request('https://wedding.test'+route,{method:'DELETE',headers:{...owner,'Content-Type':'application/json',Origin:'https://unrelated.test'},body:JSON.stringify({slug:'rudolf'})}),env,{})).status,403);
  assert.equal((await call(route,{method:'DELETE',headers:owner,body:{slug:'rudolf'}})).status,200);
  const result=await (await call('/api/admin/invitations',{headers:owner})).json();assert.equal(result.invitations.length,1);assert.equal(result.invitations[0].id,other.invitation.id);
  for(const table of ['responses','opens','gifts','guest_messages','gift_activity','reading_progress'])assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n,0);
  assert.equal(await env.BUCKET.get(proof),null);
  assert.equal((await call('/api/invitation/rudolf',{headers})).status,404);assert.equal((await call(created.sharePath)).status,404);
  assert.equal((await call(route,{method:'DELETE',headers:owner,body:{slug:'rudolf'}})).status,404);
  await create(call,{slug:'replacement-guest',eventIds:['reception'],receptionTable:'Jordan-1',seats:10});
 }finally{DB.close();}
});
test('a failed invitation deletion rolls back its linked records',async()=>{
 const {DB,call}=await fixture();try{
  const created=await create(call),headers=await guest(call,created.sharePath);await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:{responses:[{eventId:'ceremony',status:'attending',guestCount:2},{eventId:'reception',status:'declined',guestCount:0}]}});
  DB.sqlite.exec("CREATE TRIGGER prevent_test_delete BEFORE DELETE ON invitations BEGIN SELECT RAISE(ABORT,'test deletion failure'); END");
  assert.equal((await call('/api/admin/invitations/'+created.invitation.id,{method:'DELETE',headers:owner,body:{slug:'rudolf'}})).status,503);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM responses').first()).n,2);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM invitations').first()).n,1);
 }finally{DB.close();}
});

test('gift clicks and successful copies are distinct, deduplicated and attributed to authorized invitations',async()=>{
 const {DB,call}=await fixture();try{
  const created=await create(call,{guestName:'Triyono & Ribka',salutation:'bapak_ibu'}),headers=await guest(call,created.sharePath);
  const track=(action,source,requestId,access=headers)=>call('/api/gift-activity',{method:'POST',headers:access,body:{slug:'rudolf',action,source,requestId}});
  assert.equal((await track('opened','floating','unauthorized-click',{})).status,403);
  assert.equal((await track('transfer','floating','invalid-action')).status,400);
  assert.equal((await track('opened','unknown','invalid-source')).status,400);
  assert.equal((await track('opened','floating','admin-preview',owner)).status,200);
  for(let repeat=0;repeat<2;repeat++)assert.equal((await track('opened','floating','same-activity-id')).status,200);
  await track('opened','rsvp','rsvp-open-id');await track('copy_clicked','rsvp','copy-failed-id');await track('copy_clicked','floating','copy-attempt-id');await track('account_copied','floating','copy-success-id');
  const rows=(await DB.prepare('SELECT * FROM gift_activity').all()).results;assert.equal(rows.length,5);assert.ok(rows.every(row=>row.invitation_id===created.invitation.id));
  const report=await (await call('/api/admin/gift-activity',{headers:owner})).json();assert.equal(report.activity.length,1);
  const activity=report.activity[0];assert.equal(activity.invitation_name,'Triyono & Ribka');assert.equal(activity.salutation,'bapak_ibu');assert.equal(activity.opened,2);assert.equal(activity.copy_clicked,2);assert.equal(activity.account_copied,1);assert.equal(activity.visitor_hash,undefined);
  const admin=await (await call('/api/admin/invitations',{headers:owner})).json();assert.equal(admin.giftActivity[0].account_copied,1);assert.equal(admin.gifts.length,0);
  assert.equal((await call('/api/admin/gift-activity',{headers})).status,401);
 }finally{DB.close();}
});
test('public gift activity recalls the RSVP name and paginates 20 visitors without exposing visitor hashes',async()=>{
 const {DB,call}=await fixture();try{
  const headers=await visitor(call),body={action:'opened',source:'floating',requestId:'public-open-id'};
  assert.equal((await call('/api/gift-activity',{method:'POST',body})).status,403);
  await call('/api/gift-activity',{method:'POST',headers,body});
  let report=await (await call('/api/admin/gift-activity',{headers:owner})).json();assert.equal(report.activity[0].general_name,null);assert.equal(report.activity[0].visitorLabel.length,8);
  await call('/api/rsvp',{method:'POST',headers,body:{name:'Jessica Friend',responses:[{eventId:'celebration',status:'attending',guestCount:1}]}});
  report=await (await call('/api/admin/gift-activity',{headers:owner})).json();assert.equal(report.activity[0].general_name,'Jessica Friend');
  for(let i=0;i<20;i++)await call('/api/gift-activity',{method:'POST',headers:await visitor(call),body:{...body,requestId:'public-id-'+i}});
  report=await (await call('/api/admin/gift-activity',{headers:owner})).json();assert.equal(report.activity.length,20);assert.equal(report.hasMore,true);
  const next=await (await call('/api/admin/gift-activity?page=2',{headers:owner})).json();assert.equal(next.activity.length,1);assert.equal(next.hasMore,false);
  assert.ok([...report.activity,...next.activity].every(a=>a.visitor_hash===undefined));
 }finally{DB.close();}
});
test('client activity ignores previews and retries with the same id after a lost response',async()=>{
 const script=await readFile('public/gift-activity.js','utf8'),requests=[];
 const context={window:{weddingGuestReady:Promise.resolve({authorized:true,slug:'rudolf'})},crypto:{randomUUID:()=> 'test-activity-id'},fetch:async(url,options)=>{requests.push({url,...options});if(requests.length===1)throw new Error('lost response');return {ok:true};}};
 runInNewContext(script,context);await context.window.trackWeddingGiftActivity('account_copied','rsvp');assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(JSON.parse(requests[0].body).slug,'rudolf');
 context.window.weddingGuestReady=Promise.resolve({authorized:true,preview:true});await context.window.trackWeddingGiftActivity('opened','floating');assert.equal(requests.length,2);
 context.window.weddingGuestReady=Promise.resolve({authorized:false,slug:'rudolf'});await context.window.trackWeddingGiftActivity('opened','floating');assert.equal(requests.length,2);
});

test('scroll progress is monotonic, tracks distinct visits and deduplicates guests in section reach',async()=>{
 const {DB,call}=await fixture();try{
  const created=await create(call),headers=await guest(call,created.sharePath);
  const progress={slug:'rudolf',sessionId:'reading-session-one',maxDepth:20,sectionsMask:1,lastSection:0,sequence:1};
  const send=body=>call('/api/reading-progress',{method:'POST',headers,body:{...progress,...body}});
  assert.equal((await send({})).status,200);
  assert.equal((await send({maxDepth:82,sectionsMask:33,lastSection:5,sequence:3})).status,200);
  await send({maxDepth:40,sectionsMask:9,lastSection:3,sequence:2}); // Late response cannot overwrite the latest section.
  let row=await DB.prepare('SELECT * FROM reading_progress').first();assert.equal(row.max_depth,82);assert.equal(row.sections_mask,41);assert.equal(row.last_section,5);assert.equal(row.deepest_section,5);assert.equal(row.sequence,3);
  await send({maxDepth:15,sectionsMask:1,lastSection:0,sequence:4}); // Return to the top, while preserving the furthest reach.
  row=await DB.prepare('SELECT * FROM reading_progress').first();assert.equal(row.last_section,0);assert.equal(row.max_depth,82);
  await send({sessionId:'reading-session-two',maxDepth:98,sectionsMask:129,lastSection:7});
  const report=await (await call('/api/admin/reading-progress',{headers:owner})).json();assert.equal(report.summary.readers,1);assert.equal(report.summary.visits,2);assert.equal(report.summary.reach_0,1);assert.equal(report.summary.reach_5,1);assert.equal(report.summary.reach_1,0);assert.equal(report.summary.stop_7,1);assert.equal(report.summary.finished,1);
  assert.equal(report.readers[0].invitation_name,'Pak Rudolf');assert.equal(report.readers[0].max_depth,98);assert.equal(report.readers[0].visitor_hash,undefined);
  const admin=await (await call('/api/admin/invitations',{headers:owner})).json();assert.equal(admin.readingProgress[0].visits,2);assert.equal(admin.readingProgress[0].deepest_section,7);
 }finally{DB.close();}
});
test('scroll tracking rejects forged guests and invalid readings and excludes admin previews',async()=>{
 const {DB,call}=await fixture();try{
  const created=await create(call),headers=await guest(call,created.sharePath),body={slug:'rudolf',sessionId:'reading-auth-session',maxDepth:20,sectionsMask:1,lastSection:0,sequence:1};
  assert.equal((await call('/api/reading-progress',{method:'POST',body})).status,403);
  for(const invalid of [{maxDepth:101},{sectionsMask:256},{sectionsMask:0},{lastSection:5},{sequence:0}])assert.equal((await call('/api/reading-progress',{method:'POST',headers,body:{...body,...invalid}})).status,400);
  assert.equal((await call('/api/reading-progress',{method:'POST',headers:owner,body})).status,200);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM reading_progress').first()).n,0);
  assert.equal((await call('/api/admin/reading-progress',{headers})).status,401);
 }finally{DB.close();}
});
test('public scroll analytics retain names after RSVP and paginate without double counting visits',async()=>{
 const {DB,call}=await fixture();try{
  const headers=await visitor(call),body={sessionId:'general-reading-session',maxDepth:60,sectionsMask:17,lastSection:4,sequence:1};
  await call('/api/reading-progress',{method:'POST',headers,body});await call('/api/reading-progress',{method:'POST',headers,body});
  await call('/api/rsvp',{method:'POST',headers,body:{name:'Public Friend',responses:[{eventId:'celebration',status:'declined',guestCount:0}]}});
  let result=await (await call('/api/admin/reading-progress',{headers:owner})).json();assert.equal(result.summary.visits,1);assert.equal(result.readers[0].general_name,'Public Friend');
  for(let i=0;i<20;i++)await call('/api/reading-progress',{method:'POST',headers:await visitor(call),body:{...body,sessionId:'general-session-'+i}});
  result=await (await call('/api/admin/reading-progress',{headers:owner})).json();assert.equal(result.summary.readers,21);assert.equal(result.readers.length,20);assert.equal(result.hasMore,true);assert.equal(result.summary.reach_4,21);assert.equal(result.summary.stop_4,21);
  const next=await (await call('/api/admin/reading-progress?page=2',{headers:owner})).json();assert.equal(next.readers.length,1);assert.equal(next.hasMore,false);
 }finally{DB.close();}
});
test('scroll measurements only include visible sections, preserve navigation gaps and adapt to viewport size',async()=>{
 const context={window:{}};runInNewContext(await readFile('public/reading-metrics.js','utf8'),context);const sample=context.window.weddingReadingSample;
 const boxes=[{top:-2000,bottom:-1000,height:1000},{top:-1000,bottom:0,height:1000},{top:0,bottom:800,height:800},{top:800,bottom:1500,height:700}];
 const desktop=sample({boxes,viewportHeight:800,pageHeight:5000,scrollTop:2000});assert.equal(desktop.depth,56);assert.deepEqual([...desktop.visible],[2]);
 const mobile=sample({boxes:[{top:-300,bottom:544,height:844},{top:544,bottom:1200,height:656}],viewportHeight:844,pageHeight:2000,scrollTop:300});assert.equal(mobile.depth,57);assert.deepEqual([...mobile.visible],[0,1]);
 assert.equal(sample({boxes:[],viewportHeight:844,pageHeight:600,scrollTop:0}).depth,100);
});

test('browser scroll tracking waits for visible dwell, throttles writes, flushes on hide and ignores previews',async()=>{
 const metrics=await readFile('public/reading-metrics.js','utf8'),client=await readFile('public/reading-progress.js','utf8'),calls=[],intervals=[],listeners={};let now=0,atEnd=false;
 const section={getBoundingClientRect:()=>({top:0,bottom:800,height:800})},outside={getBoundingClientRect:()=>({top:900,bottom:1700,height:800})};
 const context={window:{weddingGuestReady:Promise.resolve({authorized:true,slug:'rudolf'}),addEventListener:(name,callback)=>listeners[name]=callback},document:{hidden:false,documentElement:{scrollHeight:8000},getElementById:id=>id==='home'?section:outside,querySelector:selector=>selector==='#music-gate'?{hidden:true}:null,addEventListener:(name,callback)=>listeners[name]=callback},innerHeight:800,scrollY:0,performance:{now:()=>now},crypto:{randomUUID:()=> 'browser-scroll-session'},setInterval:(fn,ms)=>intervals.push({fn,ms}),fetch:async(url,options)=>{calls.push({url,payload:JSON.parse(options.body)});return {ok:true};}};
 runInNewContext(metrics,context);runInNewContext(client,context);await context.window.weddingReadingReady;
 const sample=intervals.find(t=>t.ms===500).fn,flush=intervals.find(t=>t.ms===5000).fn;
 now=500;sample();assert.equal(calls.length,0);now=1000;sample();await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0].payload.sectionsMask,1);assert.equal(calls[0].payload.maxDepth,10);
 flush();assert.equal(calls.length,1);context.document.getElementById=()=>section;context.document.hidden=true;listeners.visibilitychange();await Promise.resolve();assert.equal(calls.length,2);assert.equal(calls[1].payload.sessionId,calls[0].payload.sessionId);
 const preview={...context,window:{weddingGuestReady:Promise.resolve({authorized:true,preview:true})},setInterval:()=>assert.fail('Preview must not start tracking')};runInNewContext(client,preview);await preview.window.weddingReadingReady;assert.equal(calls.length,2);
});

test('legacy event names use Indonesian labels and Roman numerals without losing event details',async()=>{
 const {DB,call}=await fixture();try{
  const events=structuredClone(DEFAULT_EVENTS);events.forEach(e=>delete e.titleEn);
  events[0].title='Holy Matrimony';events[1].title='Resepsi 1';events[2].title='Resepsi 2';
  events[1].venue='Double Happiness International Restaurant';events[1].end='2026-12-12T21:00:00+07:00';
  await DB.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)').bind('events',JSON.stringify(events),new Date().toISOString()).run();
  const result=await (await call('/api/events')).json();
  assert.deepEqual(result.events.map(e=>[e.title,e.titleEn]),[['Acara 1','Event 1'],['Acara 2','Event 2'],['Acara 3','Event 3']]);
  assert.equal(result.events[1].venue,events[1].venue);assert.equal(result.events[1].end,events[1].end);
 }finally{DB.close();}
});
test('CMS stores independently editable Indonesian and English event names',async()=>{
 const {DB,call}=await fixture();try{
  const events=structuredClone(DEFAULT_EVENTS);events[0].title='Janji Pernikahan';events[0].titleEn='Our Wedding Vows';
  assert.equal((await call('/api/admin/events',{method:'PUT',headers:owner,body:{events}})).status,200);
  const saved=await (await call('/api/events')).json();assert.equal(saved.events[0].title,'Janji Pernikahan');assert.equal(saved.events[0].titleEn,'Our Wedding Vows');
  const titleCode=(await readFile('public/i18n.js','utf8')).split('\n').find(line=>line.startsWith('window.weddingEventTitle='));const context={window:{weddingLanguage:'id'}};runInNewContext(titleCode,context);
  assert.equal(context.window.weddingEventTitle(saved.events[0]),'Janji Pernikahan');context.window.weddingLanguage='en';assert.equal(context.window.weddingEventTitle(saved.events[0]),'Our Wedding Vows');
  events[0].titleEn='x'.repeat(81);assert.equal((await call('/api/admin/events',{method:'PUT',headers:owner,body:{events}})).status,400);
 }finally{DB.close();}
});

test('declined reception RSVP releases seats; reattendance cannot overbook the former table',async()=>{
 const {DB,call}=await fixture();
 try{
  const first=await create(call,{seats:8,eventIds:['reception'],receptionTable:'Galilea-1'});
  const headers=await guest(call,first.sharePath);
  const decline=await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:{responses:[{eventId:'reception',status:'declined',guestCount:0}]}});
  assert.equal(decline.status,200);
  assert.equal((await (await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Pengganti',slug:'pengganti',seats:8,eventIds:['reception'],receptionTable:'Galilea-1'}})).status),201);
  const archived=await (await call('/api/admin/invitations',{headers:owner})).json();
  assert.equal(archived.responses.find(r=>r.invitation_id===first.invitation.id).status,'declined');
  const returning=await call('/api/invitation/rudolf/rsvp',{method:'POST',headers,body:{responses:[{eventId:'reception',status:'attending',guestCount:8}]}});
  assert.equal(returning.status,200);
  const saved=await returning.json();
  assert.equal(saved.seatReassignmentRequired,true);
  assert.equal(saved.receptionTable,'');
  assert.equal((await DB.prepare('SELECT reception_table FROM invitations WHERE id=?').bind(first.invitation.id).first()).reception_table,'');
  assert.equal((await DB.prepare("SELECT SUM(seats) AS occupied FROM invitations i WHERE reception_table='Galilea-1' AND active=1 AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.invitation_id=i.id AND r.event_id='reception' AND r.status='declined')").first()).occupied,8);
 }finally{DB.close();}
});
