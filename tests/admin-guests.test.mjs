import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const context={window:{}};
runInNewContext(await readFile('public/admin-guests.js','utf8'),context);
const list=context.window.weddingGuestList;
const invitations=[
 {id:'both',guestName:'Triyono & Ribka',slug:'triyono-ribka',active:true,eventIds:['ceremony','reception'],firstOpenedAt:'2026-10-01'},
 ...['one','two','three'].map(id=>({id,guestName:id,slug:id,active:true,eventIds:['reception']})),
 {id:'inactive',guestName:'Nonaktif',slug:'nonaktif',active:false,eventIds:['celebration']},
];
const responses=[
 {invitation_id:'both',event_id:'ceremony',status:'attending',guest_count:2},
 {invitation_id:'both',event_id:'reception',status:'attending',guest_count:2},
 {invitation_id:'one',event_id:'reception',status:'declined',guest_count:0},
];
test('the default admin list includes invitations assigned to different events',()=>{
 const result=list({invitations,responses});
 assert.equal(result.visible.length,3); // Fully declined invitations are now in the archive.
 assert.equal(result.active.length,4);
 assert.equal(result.opened,1);
 assert.equal(result.attending,2); // The same party attending two events counts once.
 assert.equal(result.attendingInvitations,1);
 assert.equal(list({invitations,responses,eventId:'ceremony'}).visible.length,1);
 assert.equal(list({invitations,responses,eventId:'reception'}).visible.length,3);
 assert.equal(list({invitations,responses,eventId:'reception'}).attending,2);
});
test('guest totals use allocated seats and actual RSVP party size, deduplicating multiple events',()=>{
 const invitations=[
  {id:'family',active:true,seats:4,eventIds:['ceremony','reception']},
  {id:'pending',active:true,seats:3,eventIds:['reception']},
  {id:'no',active:true,seats:2,eventIds:['reception']},
  {id:'other',active:true,seats:5,eventIds:['celebration']},
  {id:'off',active:false,seats:20,eventIds:['reception']},
 ];
 const responses=[
  {invitation_id:'family',event_id:'ceremony',status:'attending',guest_count:2},
  {invitation_id:'family',event_id:'reception',status:'attending',guest_count:4},
  {invitation_id:'no',event_id:'reception',status:'declined',guest_count:0},
  {invitation_id:'off',event_id:'reception',status:'attending',guest_count:20},
  {invitation_id:'other',event_id:'reception',status:'attending',guest_count:5}, // Old, unassigned event.
 ];
 const all=list({invitations,responses});
 assert.equal(all.active.length,4);assert.equal(all.invitedGuests,14);
 assert.equal(all.attending,4);assert.equal(all.attendingInvitations,1);
 assert.equal(all.pendingGuests,8);assert.equal(all.declinedGuests,2);
 const reception=list({invitations,responses,eventId:'reception'});
 assert.equal(reception.invitedGuests,9);assert.equal(reception.attending,4);
 assert.equal(reception.pendingGuests,3);assert.equal(reception.declinedGuests,2);
 assert.equal(list({invitations,responses,eventId:'ceremony'}).attending,2);
 // A partial RSVP counts the party that actually confirmed, rather than all four seats.
 responses[1].guest_count=3;
 assert.equal(list({invitations,responses}).attending,3);
 // Editing an allocation or deactivating an invitation updates the totals.
 invitations[1].seats=6;
 assert.equal(list({invitations,responses,eventId:'reception'}).invitedGuests,12);
 invitations[0].active=false;
 assert.equal(list({invitations,responses}).attending,0);
});
test('empty dashboards show zero and search/status filters do not change event totals',()=>{
 const empty=list({invitations:[],responses:[]});
 for(const key of ['invitedGuests','attending','pendingGuests','declinedGuests'])assert.equal(empty[key],0);
 const invitations=[{id:'family',guestName:'Family',slug:'family',active:true,seats:4,eventIds:['reception']}];
 const result=list({invitations,responses:[],search:'nobody',status:'attending'});
 assert.equal(result.visible.length,0);assert.equal(result.invitedGuests,4);assert.equal(result.pendingGuests,4);
});
test('search, RSVP and inactive filters respect the selected event scope',()=>{
 assert.equal(list({invitations,responses,status:'declined'}).visible[0].id,'one');
 assert.equal(list({invitations,responses,status:'pending'}).visible.length,2);
 assert.equal(list({invitations,responses,status:'inactive'}).visible[0].id,'inactive');
 assert.equal(list({invitations,responses,search:'RIBKA'}).visible[0].id,'both');
 assert.equal(list({invitations,responses,eventId:'ceremony',status:'declined'}).visible.length,0);
});

test('archive is scoped to the declined event, not the entire multi-event invitation',()=>{
 const people=[{id:'mixed',guestName:'Mixed',slug:'mixed',active:true,seats:2,eventIds:['ceremony','reception']}];
 const answers=[{invitation_id:'mixed',event_id:'ceremony',status:'attending',guest_count:2},{invitation_id:'mixed',event_id:'reception',status:'declined',guest_count:0}];
 assert.equal(list({invitations:people,responses:answers}).visible.length,1);
 assert.equal(list({invitations:people,responses:answers,eventId:'reception'}).visible.length,0);
 assert.equal(list({invitations:people,responses:answers,eventId:'reception',status:'declined'}).visible.length,1);
 assert.equal(list({invitations:people,responses:answers,eventId:'ceremony'}).visible.length,1);
 answers[1].status='attending';answers[1].guest_count=1;
 assert.equal(list({invitations:people,responses:answers,eventId:'reception'}).visible.length,1);
});
