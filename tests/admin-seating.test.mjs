import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const context={window:{}};
runInNewContext(await readFile('public/admin-seating.js','utf8'),context);
const {isDeclined,reservedAt,archiveEntries}=context.window.weddingSeating;
const invitations=[
 {id:'a',guestName:'A',slug:'a',active:true,seats:8,eventIds:['reception'],receptionTable:'Jordan-1'},
 {id:'b',guestName:'B',slug:'b',active:true,seats:2,eventIds:['ceremony','reception'],receptionTable:'Jordan-1'},
 {id:'c',guestName:'C',slug:'c',active:true,seats:1,eventIds:['reception'],receptionTable:''},
 {id:'inactive',guestName:'Inactive',slug:'inactive',active:false,seats:2,eventIds:['reception'],receptionTable:'Jordan-1'}
];
const responses=[
 {invitation_id:'a',event_id:'reception',status:'declined',guest_count:0,updated_at:'2026-11-01'},
 {invitation_id:'b',event_id:'ceremony',status:'attending',guest_count:2,updated_at:'2026-11-02'},
 {invitation_id:'b',event_id:'reception',status:'declined',guest_count:0,updated_at:'2026-11-03'},
 {invitation_id:'inactive',event_id:'reception',status:'declined',guest_count:0,updated_at:'2026-11-04'}
];
test('declined table assignments do not reserve seats or join unassigned roster',()=>{
 assert.equal(isDeclined(invitations[0],'reception',responses),true);
 assert.equal(isDeclined(invitations[1],'ceremony',responses),false);
 assert.equal(reservedAt(invitations,responses,'Jordan-1'),0);
 assert.equal(reservedAt(invitations,responses,'Jordan-1','a'),0);
 responses[0].status='attending';
 assert.equal(reservedAt(invitations,responses,'Jordan-1'),8);
 responses[0].status='declined';
});
test('archive is per event, supports selected event, and excludes inactive invitations',()=>{
 const events=[{id:'reception',title:'Resepsi I'},{id:'ceremony',title:'Pemberkatan'}];
 const all=archiveEntries({invitations,responses,events});
 assert.equal(all.length,2);
 assert.equal(all[0].inv.id,'b');
 assert.equal(all[0].event.title,'Resepsi I');
 assert.equal(archiveEntries({invitations,responses,events},'ceremony').length,0);
 assert.equal(archiveEntries({invitations,responses,events},'reception').length,2);
 responses[2].status='attending';
 assert.equal(archiveEntries({invitations,responses,events},'reception').length,1);
 responses[2].status='declined';
});
