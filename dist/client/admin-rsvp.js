(() => {
 const $=selector=>document.querySelector(selector);
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const labels={pending:'Belum konfirmasi',attending:'Akan hadir',declined:'Tidak hadir'};
 const sources={phone:'Telepon',whatsapp:'WhatsApp',direct:'Konfirmasi langsung',other:'Lainnya'};
 const form=$('#admin-rsvp-form'),dialog=$('#admin-rsvp-dialog');
 let invite=null,context=null,onSaved=null,selected='',history=[];
 function replyFor(eventId){return context.responses.find(r=>r.invitation_id===invite.id&&r.event_id===eventId)||null;}
 function showEvent(){
  const reply=replyFor(selected);
  form.elements.status.value=reply?.status||'pending';
  form.elements.guestCount.value=reply?.guest_count>0?reply.guest_count:Math.min(invite.seats,1);
  form.elements.guestCount.max=invite.seats;
  $('#admin-rsvp-current').textContent='RSVP tersimpan: '+labels[reply?.status||'pending']+(reply?.status==='attending'?' · '+reply.guest_count+' orang':'')+'.';
  $('#admin-rsvp-updated').textContent=reply?.updated_at?'Terakhir diubah: '+new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(reply.updated_at)):'Belum ada jawaban.';
  form.elements.source.value='whatsapp';
  form.elements.note.value='';
  $('#admin-rsvp-error').textContent='';
  showCount();
 }
 function showCount(){
  const attending=form.elements.status.value==='attending';
  $('#admin-rsvp-count-field').hidden=!attending;
  form.elements.guestCount.required=attending;
  if(attending&&(!Number(form.elements.guestCount.value)||Number(form.elements.guestCount.value)>invite.seats))form.elements.guestCount.value=1;
  $('#admin-rsvp-seating-note').hidden=!(selected==='reception'&&attending);
 }
 function showHistory(){
  const events=new Map(context.events.map(e=>[e.id,e.title]));
  $('#admin-rsvp-history').innerHTML=history.length?history.slice(0,15).map(row=>{
   const after=row.after||{},before=row.before;
   return `<li><strong>${esc(events.get(row.eventId)||row.eventId)} · ${esc(labels[after.status]||after.status)}${after.status==='attending'?' · '+Number(after.guestCount||0)+' orang':''}</strong>
    <small>${esc(row.actor)} · ${esc(sources[after.source]||after.source||'Admin')} · ${esc(new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(row.at)))}</small>
    <small>${esc(before?labels[before.status]||before.status:'Belum ada RSVP')} → ${esc(labels[after.status]||after.status)}</small>
    ${after.note?`<p>${esc(after.note)}</p>`:''}</li>`;
  }).join(''):'<li>Belum ada perubahan RSVP dari CMS.</li>';
 }
 async function open(inv,data,saved,preferredEvent=''){
  if(!inv?.active){throw new Error('Aktifkan undangan terlebih dahulu sebelum mencatat RSVP.');}
  invite=inv;context=data;onSaved=saved;
  selected=inv.eventIds.includes(preferredEvent)?preferredEvent:inv.eventIds[0];
  $('#admin-rsvp-name').textContent=window.weddingDisplayName?.(inv,'id')||inv.guestName;
  $('#admin-rsvp-maximum').textContent='Maksimum '+inv.seats+' orang per acara. Perubahan ini juga dapat dilihat dan diubah kembali oleh tamu.';
  form.elements.eventId.innerHTML=inv.eventIds.map(eventId=>{
   const event=data.events.find(e=>e.id===eventId);
   return `<option value="${esc(eventId)}">${esc(event?.title||eventId)}</option>`;
  }).join('');
  form.elements.eventId.value=selected;
  showEvent();
  const detail=$('#detail-dialog');if(detail?.open)detail.close();
  dialog.showModal();
  $('#admin-rsvp-history').innerHTML='<li>Memuat riwayat…</li>';
  try{
   const response=await fetch('/api/admin/invitations/'+encodeURIComponent(inv.id)+'/rsvp-log',{headers:{Accept:'application/json'}});
   if(!response.ok)throw new Error('Riwayat tidak tersedia');
   history=(await response.json()).history||[];
   if(dialog.open&&invite?.id===inv.id)showHistory();
  }catch{if(dialog.open)$('#admin-rsvp-history').innerHTML='<li>Riwayat belum dapat dimuat. Coba buka kembali formulir.</li>';}
 }
 form.elements.eventId.addEventListener('change',event=>{selected=event.target.value;showEvent();});
 form.elements.status.addEventListener('change',showCount);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#admin-rsvp-save'),reply=replyFor(selected);
  const payload={eventId:selected,status:form.elements.status.value,
   guestCount:form.elements.status.value==='attending'?Number(form.elements.guestCount.value):0,
   expectedUpdatedAt:reply?.updated_at||null,source:form.elements.source.value,note:form.elements.note.value.trim()};
  button.disabled=true;$('#admin-rsvp-error').textContent='';
  try{
   const response=await fetch('/api/admin/invitations/'+encodeURIComponent(invite.id)+'/rsvp',{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   let result;try{result=await response.json();}catch{throw new Error('Respons server tidak dapat dibaca.');}
   if(!response.ok){if(response.status===401)location.href='/admin';throw new Error(result.error||'Gagal menyimpan RSVP.');}
   const id=invite.id;
   dialog.close();await onSaved(id,result);
  }catch(error){$('#admin-rsvp-error').textContent=error.message;}finally{button.disabled=false;}
 });
 window.weddingAdminRsvp={open};
})();
