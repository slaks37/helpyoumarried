// RSVP declines are archived per event, not deleted. Old table assignments
// remain as history but no longer consume operational seats.
(() => {
 const isDeclined=(inv,eventId,responses)=>inv.eventIds.includes(eventId)&&responses.some(r=>r.invitation_id===inv.id&&r.event_id===eventId&&r.status==='declined');
 const reservedAt=(invitations,responses,table,exceptId=null)=>invitations.filter(inv=>inv.id!==exceptId&&inv.active&&inv.receptionTable===table&&inv.eventIds.includes('reception')&&!isDeclined(inv,'reception',responses)).reduce((sum,inv)=>sum+(Number(inv.seats)||0),0);
 const archiveEntries=({invitations,responses,events},eventId='all')=>invitations.filter(inv=>inv.active).flatMap(inv=>inv.eventIds.filter(id=>eventId==='all'||id===eventId).filter(id=>isDeclined(inv,id,responses)).map(id=>({inv,event:events.find(e=>e.id===id),response:responses.find(r=>r.invitation_id===inv.id&&r.event_id===id)}))).sort((a,b)=>String(b.response?.updated_at||'').localeCompare(String(a.response?.updated_at||'')));
 window.weddingSeating={isDeclined,reservedAt,archiveEntries};
})();
