import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createLocalDB} from '../scripts/local-db.mjs';

test('Supabase transport keeps invitations, RSVP, and admin records connected',async()=>{
 const database=await createLocalDB();
 const originalFetch=globalThis.fetch;
 const calls=[];const sqlScope={};runInNewContext((await readFile('supabase/functions/wedding-db/allowlist.ts','utf8')).replace('export const ALLOWED_SQL','const ALLOWED_SQL')+';this.allowed=ALLOWED_SQL;',sqlScope);
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://lgwrwymrjcptoztjvbxz.supabase.co/functions/v1/wedding-db');
  assert.equal(options.headers['x-wedding-db-token'],'a'.repeat(64));
  const {operations}=JSON.parse(options.body);
  calls.push(operations.map(operation=>operation.sql));
  const results=[];
  for(const operation of operations){
   assert.ok(sqlScope.allowed.has(operation.sql),'SQL must be allowed by the production adapter');
   const statement=database.prepare(operation.sql).bind(...operation.args);
   if(operation.mode==='first')results.push({rows:[await statement.first()].filter(Boolean),count:1});
   else if(operation.mode==='all')results.push({rows:(await statement.all()).results,count:1});
   else{await statement.run();results.push({rows:[],count:1});}
  }
  return Response.json({results});
 };
 const env={SUPABASE_DB_ENABLED:'true',SUPABASE_URL:'https://lgwrwymrjcptoztjvbxz.supabase.co',WEDDING_DB_TOKEN:'a'.repeat(64),ADMIN_EMAIL:'owner@example.com',ADMIN_SESSION_SECRET:'test-only-secret-with-32-random-bytes',ASSETS:{fetch:async()=>new Response('<html>Invitation</html>')}};
 const owner={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'};
 const call=(route,{method='GET',body,headers={}}={})=>worker.fetch(new Request('https://wedding.test'+route,{method,headers:{...headers,...(body?{'Content-Type':'application/json',Origin:'https://wedding.test'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{});
 try{
  const created=await call('/api/admin/invitations',{method:'POST',headers:owner,body:{guestName:'Triyono & Ribka',slug:'triyono-ribka',seats:2,eventIds:['ceremony'],phone:'',privateNote:''}});
  assert.equal(created.status,201);
  const {sharePath}=await created.json();
  const personalized=await (await call('/api/invitation/triyono-ribka')).json();
  assert.equal(personalized.invitation.guestName,'Triyono & Ribka');
  assert.deepEqual(personalized.events.map(event=>event.id),['ceremony']);
  const exchange=await call(sharePath);
  const Cookie=exchange.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/invitation/triyono-ribka/rsvp',{method:'POST',headers:{Cookie},body:{message:'Hadir',responses:[{eventId:'ceremony',status:'attending',guestCount:2}]}})).status,200);
  assert.equal((await call('/api/reading-progress',{method:'POST',headers:{Cookie},body:{slug:'triyono-ribka',sessionId:'transport-reading-session',maxDepth:70,sectionsMask:33,lastSection:5,sequence:1}})).status,200);
  const report=await (await call('/api/admin/reading-progress',{headers:owner})).json();assert.equal(report.summary.readers,1);assert.equal(report.summary.reach_5,1);
  const admin=await (await call('/api/admin/invitations',{headers:owner})).json();
  assert.equal(admin.invitations.length,1);
  assert.equal(admin.responses[0].guest_count,2);
  assert.ok(calls.some(batch=>batch.some(sql=>sql.startsWith('INSERT INTO responses'))));
  assert.equal((await call('/api/admin/invitations/'+admin.invitations[0].id,{method:'DELETE',headers:owner,body:{slug:'triyono-ribka'}})).status,200);
  assert.equal((await (await call('/api/admin/invitations',{headers:owner})).json()).invitations.length,0);
  assert.ok(calls.some(batch=>batch.length===7&&batch.every(sql=>sql.startsWith('DELETE FROM'))));
 }finally{globalThis.fetch=originalFetch;database.close();}
});
