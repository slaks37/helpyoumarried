window.weddingGuestReady=(async()=>{
 await window.weddingContentReady;
 const ui=window.weddingUi,title=window.weddingEventTitle,copy=window.weddingCopy,$=s=>document.querySelector(s),esc=htmlEscape;
 const slug=location.pathname.replace(/^\/|\/$/g,''),personal=/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&!['admin','index.html'].includes(slug);
 async function request(path,body){
  const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  let value;try{value=await r.json();}catch{throw new Error(ui('Layanan sedang tidak tersedia. Silakan coba lagi.','The service is temporarily unavailable. Please try again.'));}
  if(!r.ok)throw new Error(window.weddingLanguage==='en'?'We could not save this. Please try again.':value.error||'Belum berhasil disimpan. Coba lagi.');return value;
 }
 function enableRsvp(info,invite,{general=false,preview=false}={}){
   function showReceptionTable(){
    const declined=info.responses.some(r=>r.event_id==='reception'&&r.status==='declined');
    const show=!general&&Boolean(invite.receptionTable)&&invite.eventIds.includes('reception')&&!declined;
    $('#rsvp-table').hidden=!show;
    if(show)$('#rsvp-table-value').textContent=invite.receptionTable.replace('-',ui(' · Meja ',' · Table '));
   }
   showReceptionTable();
  const form=$('#rsvp-form');form.hidden=false;$('#rsvp-access-note').hidden=!preview;
  if(preview){$('#rsvp-access-note').textContent=ui('Pratinjau undangan. Pilih jawaban untuk melihat pesannya; jawaban ini tidak tersimpan.','Invitation preview. Choose a reply to preview its message; your choice will not be saved.');form.querySelector('[data-cms="rsvpSubmit"]').textContent=ui('Konfirmasi Kehadiran','Confirm attendance');form.querySelector('.rsvp-privacy').textContent=ui('Untuk tamu, tombol ini menyimpan konfirmasi kehadiran.','For guests, this button saves their RSVP.');}
  $('#rsvp-general-name').hidden=!general;form.elements.guestName.required=general;form.elements.guestName.value=general?(info.name||''):'';
  if(general){$('#rsvp-seat-heading').textContent=copy('rsvpGeneralHeading');$('[data-cms="rsvpHeadingAccent"]').textContent=copy('rsvpGeneralAccent');}
  $('.rsvp-for').hidden=general;
  $('#rsvp-events').innerHTML=info.events.map(event=>{
   const old=info.responses.find(r=>r.event_id===event.id);
   return `<fieldset class="rsvp-event" data-event-id="${event.id}"><legend>${esc(title(event))}</legend><p>${esc(window.weddingEventDateLabel(event))}</p><div class="rsvp-choice"><label><input type="radio" name="status-${event.id}" value="attending" ${old?.status==='attending'?'checked':''} required> <span>${esc(copy('rsvpAttending'))}</span></label><label><input type="radio" name="status-${event.id}" value="declined" ${old?.status==='declined'?'checked':''} required> <span>${esc(copy('rsvpDeclined'))}</span></label></div><label class="guest-label guest-count-label" ${old?.status!=='attending'?'hidden':''}><span>${esc(copy('rsvpGuestCount'))}</span><select name="count-${event.id}">${Array.from({length:invite.seats},(_,i)=>`<option value="${i+1}" ${old?.guest_count===i+1?'selected':''}>${i+1} ${ui('orang','guests')}</option>`).join('')}</select></label></fieldset>`;
  }).join('');
  $('#rsvp-events').addEventListener('change',e=>{if(e.target.matches('[type=radio]'))e.target.closest('fieldset').querySelector('.guest-count-label').hidden=e.target.value!=='attending';});
  if(info.responses.length)$('#rsvp-status').textContent=ui('Jawaban sebelumnya sudah tersimpan. Silakan perbarui jika ada perubahan.','Your previous reply is saved. You can update it here.');
  window.setWeddingReminder(preview?[]:info.responses.filter(r=>r.status==='attending').map(r=>r.event_id));window.setWeddingMood(info.responses);
  form.addEventListener('submit',async e=>{
   e.preventDefault();const button=form.querySelector('[type=submit]');
   const responses=info.events.map(event=>({eventId:event.id,status:form.elements['status-'+event.id].value,guestCount:Number(form.elements['count-'+event.id].value),expectedUpdatedAt:info.responses.find(r=>r.event_id===event.id)?.updated_at||null}));
   if(preview){window.setWeddingMood(responses,true);return;}
   button.disabled=true;$('#rsvp-status').textContent=ui('Menyimpan konfirmasi…','Saving your reply…');
   try{
    const result=await request(general?'/api/rsvp':`/api/invitation/${slug}/rsvp`,{responses,name:form.elements.guestName.value,message:info.responses.find(r=>r.message)?.message||''});
    if(!result.saved||!Array.isArray(result.responses))throw new Error(ui('Konfirmasi belum tersimpan. Silakan coba lagi.','Your RSVP was not saved. Please try again.'));
    if(general)window.dispatchEvent(new CustomEvent('wedding-rsvp-saved',{detail:{name:form.elements.guestName.value.trim()}}));
    info.responses=result.responses;if(!general&&typeof result.receptionTable==='string')invite.receptionTable=result.receptionTable;showReceptionTable();const attending=result.responses.filter(r=>r.status==='attending');
    $('#rsvp-status').textContent=attending.length?ui('Kehadiran sudah tercatat. Terima kasih, sampai bertemu!','Your attendance is saved. Thank you, see you there!'):ui('Jawaban sudah tercatat. Terima kasih sudah memberi kabar.','Your reply is saved. Thank you for letting us know.');
    window.setWeddingReminder(attending.map(r=>r.event_id));window.setWeddingMood(result.responses,true);
   }catch(error){$('#rsvp-status').textContent=error.message;}finally{button.disabled=false;}
  });
 }
 if(!personal){
  try{const [eventInfo,visitor]=await Promise.all([request('/api/events'),request('/api/visitor')]);const events=eventInfo.events.filter(event=>event.id==='celebration');const responses=(visitor.rsvp?.responses||[]).filter(response=>response.event_id==='celebration');window.renderWeddingEvents(events);$('[data-cms="heroSubtitle"]').hidden=true;$('#hero-invite-events').hidden=false;$('#hero-invite-events').textContent=events.map(event=>`${title(event)}\n${window.weddingEventDateLabel(event)}`).join('\n');enableRsvp({events,responses,name:visitor.rsvp?.name||''},{seats:20},{general:true,preview:visitor.preview});window.revealWedding();return {slug:'',preview:visitor.preview,authorized:true};}
  catch(error){$('#rsvp-access-note').textContent=error.message;window.revealWedding();return {slug:'',authorized:false};}
 }
 $('#guest-name').textContent=ui('Menyiapkan undangan…','Preparing your invitation…');$('#memo-recipient').textContent=$('#guest-name').textContent;
 $('[data-cms="heroSubtitle"]').hidden=true;$('#hero-invite-events').hidden=false;$('#hero-invite-events').textContent=ui('Menyiapkan detail acara…','Loading event details…');window.renderWeddingEvents([]);$('#wedding-date').textContent='';$('#countdown').hidden=true;
 let info;
 try{info=await request('/api/invitation/'+encodeURIComponent(slug));}catch(error){$('#guest-name').textContent=ui('Undangan tidak tersedia','Invitation unavailable');$('#memo-recipient').textContent=$('#guest-name').textContent;$('#hero-invite-events').textContent=ui('Detail acara tidak tersedia.','Event details are unavailable.');$('#rsvp-access-note').textContent=error.message;$('#gift-access-note').textContent=error.message;window.revealWedding();return {slug,authorized:false};}
 const invite=info.invitation;window.setWeddingRecipient(invite);window.setRsvpSeats(invite.seats);
 const recipientName=window.weddingRecipientName(invite);for(const selector of ['#guest-name','#memo-recipient','#rsvp-name'])$(selector).textContent=recipientName;
 // The table label follows the RSVP status in enableRsvp.
 const shortDate=new Intl.DateTimeFormat(window.weddingLanguage==='en'?'en-US':'id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'});
 const dates=[...new Set(info.events.map(event=>shortDate.format(new Date(event.date+'T12:00:00+07:00'))))];$('#hero-invite-events').textContent=`${ui('Diundang ke','Invited to')} ${info.events.map(title).join(' & ')}\n${dates.join(' & ')}`;
 window.renderWeddingEvents(info.events);
 if(info.accessRequired){$('#rsvp-access-note').textContent=copy('rsvpLockedNote');$('#gift-access-note').textContent=copy('giftLockedNote');window.revealWedding();return {slug,invite,authorized:false};}
 enableRsvp(info,invite,{preview:info.preview});window.revealWedding();
 if(info.preview){$('#gift-access-note').textContent=copy('giftPreviewNote');return {slug,invite,preview:true,authorized:true};}
 $('#gift-access-note').hidden=true;$('#guest-gift-form').hidden=false;
 const heartButton=$('#tap-heart'),heartStatus=$('#heart-tap-status');let heartBusy=false;heartButton.addEventListener('click',async()=>{if(heartBusy)return;heartBusy=true;try{const result=await request(`/api/invitation/${slug}/heart`,{});heartStatus.textContent=`${result.heartCount} ${ui('hati terkirim dari undangan ini','hearts sent from this invitation')} ♡`;}catch(error){heartStatus.textContent=error.message;}finally{setTimeout(()=>heartBusy=false,180);}});
 let giftRequestId=crypto.randomUUID();$('#guest-gift-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;$('#guest-gift-status').textContent=ui('Menyimpan konfirmasi…','Saving your reply…');try{await request(`/api/invitation/${slug}/gift`,{requestId:giftRequestId,kind:form.elements.kind.value,amount:form.elements.amount.value,note:form.elements.note.value});$('#guest-gift-status').textContent=copy('closingThanks')+ui(' Hadiah akan diverifikasi oleh (nama pria) & (nama wanita).',' (nama pria) & (nama wanita) will verify the gift.');form.reset();giftRequestId=crypto.randomUUID();const r=button.getBoundingClientRect();hearts(r.x+r.width/2,r.y,12);}catch(error){$('#guest-gift-status').textContent=error.message;}finally{button.disabled=false;}});
 let visitId;try{visitId=sessionStorage.getItem('sj-visit-'+slug);if(!visitId){visitId=crypto.randomUUID();sessionStorage.setItem('sj-visit-'+slug,visitId);}}catch{visitId=crypto.randomUUID();}
 let tracked=false;const track=async()=>{if(tracked||document.visibilityState!=='visible')return;try{await request(`/api/invitation/${slug}/opened`,{visitId});tracked=true;}catch{ /* tracking failure must not prevent guests from using their invitation */ }};
 const trackWhenVisible=()=>{if(document.visibilityState==='visible')setTimeout(track,1200);};trackWhenVisible();document.addEventListener('visibilitychange',trackWhenVisible);
 return {slug,invite,preview:false,authorized:true};
})();
