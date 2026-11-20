// Keep the list and its counters on the same event scope. An empty filter means all events.
window.weddingGuestList=function({invitations,responses,eventId='all',search='',status='all'}){
 const scoped=invitations.filter(i=>!eventId||eventId==='all'||i.eventIds.includes(eventId));
 const replies=i=>i.eventIds.filter(id=>!eventId||eventId==='all'||id===eventId).map(id=>responses.find(r=>r.invitation_id===i.id&&r.event_id===id)||{status:'pending',guest_count:0});
 const active=scoped.filter(i=>i.active),term=search.toLocaleLowerCase('id-ID').trim();
 const archived=i=>{const answers=replies(i);return answers.length>0&&answers.every(r=>r.status==='declined');};
 const visible=scoped.filter(i=>{
  if(status==='inactive'?i.active:!i.active)return false;
  if(term&&!`${i.guestName} ${i.slug}`.toLocaleLowerCase('id-ID').includes(term))return false;
  if(status==='all'&&archived(i))return false;
  if(status==='unopened'&&i.firstOpenedAt)return false;
  if(status==='opened'&&!i.firstOpenedAt)return false;
  return !['pending','attending','declined'].includes(status)||replies(i).some(r=>r.status===status);
 });
 // Across events the same invitation is counted once, using its largest RSVP party.
 const attending=active.reduce((sum,i)=>sum+Math.max(0,...replies(i).filter(r=>r.status==='attending').map(r=>Number(r.guest_count)||0)),0);
 const awaiting=active.filter(i=>replies(i).every(r=>r.status==='pending'));
 const declined=active.filter(archived);
 const seats=items=>items.reduce((sum,i)=>sum+(Number(i.seats)||0),0);
 return {active,visible,attending,attendingInvitations:active.filter(i=>replies(i).some(r=>r.status==='attending')).length,
  invitedGuests:seats(active),pendingGuests:seats(awaiting),pendingInvitations:awaiting.length,
  declinedGuests:seats(declined),declinedInvitations:declined.length,opened:active.filter(i=>i.firstOpenedAt).length};
};
