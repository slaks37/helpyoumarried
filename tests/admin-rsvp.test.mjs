import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {createLocalDB} from '../scripts/local-db.mjs';
const owner={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'};
async function fixture(){
 const DB=await createLocalDB(),env={DB,ADMIN_EMAIL:'owner@example.com',ASSETS:{fetch:async()=>new Response('OK')}};
 const call=(path,method='GET',value=undefined,headers=owner)=>worker.fetch(new Request('https://wedding.test'+path,{method,headers:{...headers,...(value!==undefined?{'Content-Type':'application/json',Origin:'https://wedding.test'}:{})},...(value!==undefined?{body:JSON.stringify(value)}:{})}),env,{});
 const create=async(extra={})=>{
  const resp=await call('/api/admin/invitations','POST',{guestName:'Tamu RSVP Admin',slug:'qa-'+crypto.randomUUID(),seats:4,eventIds:['ceremony','reception'],receptionTable:'Jordan-1',...extra});
  assert.equal(resp.status,201);return resp.json();
 };
 const save=(inv,eventId='reception',status='attending',count=2,updatedAt=null,source='whatsapp')=>call('/api/admin/invitations/'+inv.id+'/rsvp','PATCH',{eventId,status,guestCount:count,expectedUpdatedAt:updatedAt,source,note:'Dikonfirmasi admin'});
 return {DB,call,create,save};
}
test('only the owner can change RSVPs, with assigned event and capacity validation',async()=>{
 const {DB,call,create,save}=await fixture();try{
  const {invitation}=await create();
  const path='/api/admin/invitations/'+invitation.id+'/rsvp';
  const body={eventId:'reception',status:'attending',guestCount:2,source:'whatsapp',expectedUpdatedAt:null};
  assert.equal((await call(path,'PATCH',body,{})).status,401);
  assert.equal((await call(path,'PATCH',body,{'oai-authenticated-user-id':'unauthorized','oai-authenticated-user-email':'other@example.com'})).status,403);
  assert.equal((await call(path,'PATCH',{...body,eventId:'celebration'})).status,400);
  assert.equal((await call(path,'PATCH',{...body,guestCount:5})).status,400);
  assert.equal((await call(path,'PATCH',{...body,source:'unknown'})).status,400);
  assert.equal((await call(path,'PATCH',{...body,expectedUpdatedAt:undefined})).status,400);
  assert.equal((await call(path,'PATCH',{...body,expectedUpdatedAt:'bad'})).status,409);
  const unauthorized=await call('/api/admin/invitations/'+invitation.id+'/rsvp-log','GET',undefined,{});
  assert.equal(unauthorized.status,401);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM responses').first()).total,0);
 }finally{DB.close();}
});
test('admin attendance per event preserves other RSVPs, guest message, and audit provenance',async()=>{
 const {DB,call,create,save}=await fixture();try{
  const {invitation}=await create();
  const first=await save(invitation,'ceremony','attending',3,null,'phone');
  assert.equal(first.status,200);
  const a=await first.json();
  assert.equal(a.response.guest_count,3);
  const second=await save(invitation,'reception','declined',0,null,'direct');
  assert.equal(second.status,200);
  const b=await second.json();
  let rows=(await DB.prepare('SELECT event_id,status,guest_count FROM responses ORDER BY event_id').all()).results;
  assert.deepEqual(rows.map(row=>({...row})),[{event_id:'ceremony',status:'attending',guest_count:3},{event_id:'reception',status:'declined',guest_count:0}]);
  const update=await save(invitation,'reception','pending',0,b.response.updated_at,'whatsapp');
  assert.equal(update.status,200);
  rows=(await DB.prepare('SELECT event_id,status,guest_count FROM responses ORDER BY event_id').all()).results;
  assert.equal(rows[1].status,'pending');
  await DB.prepare("UPDATE responses SET message='Pesan khusus pribadi' WHERE invitation_id=? AND event_id='reception'").bind(invitation.id).run();
  const pending=(await update.json()).response;
  const attending=await save(invitation,'reception','attending',2,pending.updated_at,'other');
  assert.equal(attending.status,200);
  assert.equal((await DB.prepare("SELECT message FROM responses WHERE invitation_id=? AND event_id='reception'").bind(invitation.id).first()).message,'Pesan khusus pribadi');
  const history=await (await call('/api/admin/invitations/'+invitation.id+'/rsvp-log')).json();
  assert.equal(history.history.length,4);
  assert.equal(history.history[0].actor,'owner@example.com');
  assert.equal(history.history[0].after.source,'other');
  assert.equal(history.history[1].before.status,'declined');
  assert.ok(history.history.some(row=>row.eventId==='ceremony'));
  assert.equal(history.history.filter(row=>row.eventId==='reception').length,3);
  assert.equal((await save(invitation,'reception','declined',0,b.response.updated_at)).status,409);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM journey_activity WHERE action=?').bind('rsvp_admin').first()).total,4);
 }finally{DB.close();}
});
test('admin RSVP releases declined table seats and prevents overbooking on later confirmation',async()=>{
 const {DB,call,create,save}=await fixture();try{
  const first=await create({seats:8,eventIds:['reception']});
  const declined=await save(first.invitation,'reception','declined',0);
  assert.equal(declined.status,200);
  const other=await call('/api/admin/invitations','POST',{guestName:'Tamu Pengganti',slug:'pengganti-'+crypto.randomUUID(),seats:8,eventIds:['reception'],receptionTable:'Jordan-1'});
  assert.equal(other.status,201);
  const back=await save(first.invitation,'reception','attending',8,(await declined.json()).response.updated_at);
  assert.equal(back.status,200);
  const result=await back.json();assert.equal(result.seatReassignmentRequired,true);
  assert.equal(result.receptionTable,'');
  const table=await DB.prepare('SELECT reception_table FROM invitations WHERE id=?').bind(first.invitation.id).first();
  assert.equal(table.reception_table,'');
 }finally{DB.close();}
});
test('admin cannot mark checked-in guest as absent; stale updates do not overwrite guest replies',async()=>{
 const {DB,call,create,save}=await fixture();try{
  const {invitation,sharePath}=await create({eventIds:['reception'],seats:4});
  const check=await call('/api/admin/journey/attendance','PUT',{key:'invitation:'+invitation.id,eventId:'reception',checkedIn:2,seated:1,souvenirs:0,note:'',revision:0});
  assert.equal(check.status,200);
  assert.equal((await save(invitation,'reception','declined',0)).status,409);
  assert.equal((await save(invitation,'reception','pending',0)).status,409);
  const initial=await save(invitation,'reception','attending',2);
  assert.equal(initial.status,200);
  const old=(await initial.json()).response.updated_at;
  const exchange=await call(sharePath,'GET',undefined,{});
  assert.equal(exchange.status,303);
  const cookie=exchange.headers.get('set-cookie').split(';')[0];
  const newReply=await call('/api/invitation/'+invitation.slug+'/rsvp','POST',{responses:[{eventId:'reception',status:'attending',guestCount:3}]},{Cookie:cookie});
  assert.equal(newReply.status,200);
  const stale=await save(invitation,'reception','attending',4,old);
  assert.equal(stale.status,409);
  assert.equal((await DB.prepare('SELECT guest_count FROM responses WHERE invitation_id=?').bind(invitation.id).first()).guest_count,3);
 }finally{DB.close();}
});

test('an archived RSVP may reset to pending without reoccupying a full table, and admin may edit its invitation',async()=>{
 const {DB,call,create,save}=await fixture();
 try{
  const first=await create({seats:8,eventIds:['reception'],receptionTable:'Jordan-2'});
  const declined=await save(first.invitation,'reception','declined',0);
  assert.equal(declined.status,200);
  const response=await call('/api/admin/invitations','POST',{guestName:'Pengganti',slug:'pengganti-'+crypto.randomUUID(),seats:8,eventIds:['reception'],receptionTable:'Jordan-2'});
  assert.equal(response.status,201);
  const updated=await call('/api/admin/invitations/'+first.invitation.id,'PATCH',{guestName:'Tamu berubah nama',seats:8,eventIds:['reception'],receptionTable:'Jordan-2',active:true});
  assert.equal(updated.status,200);
  const reopened=await save(first.invitation,'reception','pending',0,(await declined.json()).response.updated_at);
  assert.equal(reopened.status,200);
  assert.equal((await reopened.json()).seatReassignmentRequired,true);
  assert.equal((await DB.prepare('SELECT reception_table FROM invitations WHERE id=?').bind(first.invitation.id).first()).reception_table,'');
 }finally{DB.close();}
});

test('guest form version conflicts with a newer admin confirmation and preserves the existing message',async()=>{
 const {DB,call,create,save}=await fixture();try{
  const {invitation,sharePath}=await create({eventIds:['reception']});
  const exchange=await call(sharePath,'GET',undefined,{}),Cookie=exchange.headers.get('set-cookie').split(';')[0];
  const a=await save(invitation);assert.equal(a.status,200);const first=(await a.json()).response.updated_at;
  const b=await save(invitation,'reception','attending',3,first);assert.equal(b.status,200);
  const stale=await call('/api/invitation/'+invitation.slug+'/rsvp','POST',{responses:[{eventId:'reception',status:'declined',guestCount:0,expectedUpdatedAt:first}]},{Cookie});assert.equal(stale.status,409);
  assert.equal((await DB.prepare('SELECT guest_count FROM responses WHERE invitation_id=?').bind(invitation.id).first()).guest_count,3);
 }finally{DB.close();}
});
