(() => {
 const $=selector=>document.querySelector(selector);
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const modal=$('#bulk-rsvp-dialog'),form=$('#bulk-rsvp-form'),limit=50;
 const selected=new Set(),counts=new Map(),statuses=new Map();
 let context={invitations:[],events:[],responses:[]},refresh=async()=>{},toast=()=>{},running=false,finished=false;
 const allInvites=()=>[...selected].map(id=>context.invitations.find(inv=>inv.id===id)).filter(Boolean);
 const response=(inv,eventId)=>context.responses.find(r=>r.invitation_id===inv.id&&r.event_id===eventId)||null;
 const display=inv=>window.weddingDisplayName?.(inv,'id')||inv.guestName;
 const eventPicker=$('#bulk-rsvp-events');
 const rowKey=(id,eventId)=>id+'|'+eventId;
 const eligible=()=>{
  const eventIds=new Set([...eventPicker.querySelectorAll(':checked')].map(input=>input.value));
  const events=context.events.filter(event=>eventIds.has(event.id));
  return allInvites().flatMap(inv=>events
   .filter(event=>inv.active&&inv.eventIds.includes(event.id))
   .map(event=>({inv,event,key:rowKey(inv.id,event.id)})));
 };
 const currentCount=({inv,event,key})=>{
  if(counts.has(key))return counts.get(key);
  const r=response(inv,event.id);
  return r?.status==='attending'&&r.guest_count>0?String(r.guest_count):'';
 };
 function sync(){
  for(const input of document.querySelectorAll('[data-bulk-rsvp-select]'))input.checked=selected.has(input.dataset.bulkRsvpSelect);
  for(const [scope,btnId] of [['guest','#guest-bulk-rsvp-open'],['archive','#archive-bulk-rsvp-open']]){
   const btn=$(btnId);btn.disabled=!selected.size||running;btn.textContent='✓ Konfirmasi massal ('+selected.size+')';
   const visible=visibleIds(scope),all=visible.length>0&&visible.every(id=>selected.has(id));
   $('#'+scope+'-bulk-select-visible').textContent=all?'Batalkan pilihan yang tampil':'Pilih semua yang tampil';
  }
 }
 function setContext(next,onRefresh,onToast){
  context=next;refresh=onRefresh;toast=onToast;
  for(const id of [...selected])if(!context.invitations.some(inv=>inv.id===id&&inv.active))selected.delete(id);
  sync();
 }
 function visibleIds(scope){
  const root=$(scope==='archive'?'#archive-rows':'#guest-rows');
  return [...new Set([...root.querySelectorAll('[data-bulk-rsvp-select]:not(:disabled)')].map(el=>el.dataset.bulkRsvpSelect))];
 }
 function selectVisible(scope){
  const ids=visibleIds(scope);
  if(ids.length&&ids.every(id=>selected.has(id)))ids.forEach(id=>selected.delete(id));
  else {
   for(const id of ids)if(!selected.has(id)){
    if(selected.size===limit){toast('Maksimum '+limit+' undangan per proses. Simpan kelompok ini sebelum memilih lainnya.');break;}
    selected.add(id);
   }
  }
  sync();
 }
 function showPreview(){
  if(!modal.open||running||finished)return;
  const rows=eligible();
  const matched=new Set(rows.map(({inv})=>inv.id)).size;
  const excluded=allInvites().length-matched;
  $('#bulk-rsvp-preview-info').textContent=matched+' undangan cocok · '+rows.length+' pilihan RSVP.'+(excluded?' '+excluded+' undangan lain tidak diundang ke acara yang dipilih.':'');
  $('#bulk-rsvp-review-rows').innerHTML=rows.length?rows.map(row=>{
   const {inv,event,key}=row;
   const before=response(inv,event.id),current=before?.status==='attending'?'Akan hadir · '+before.guest_count+' orang':before?.status==='declined'?'Tidak hadir':'Belum konfirmasi';
   const id=esc(inv.id),name=esc(display(inv)),title=esc(event.title);
   const status=statuses.get(key);
   const attending=status==='attending';
   return `<tr data-bulk-rsvp-key="${esc(key)}"><td><strong>${name}</strong><small>${title}</small><small>Maksimal ${inv.seats} orang</small></td><td>${esc(current)}</td><td>
    <select data-bulk-rsvp-status="${id}" aria-label="Status konfirmasi ${name} · ${title}">
     <option value="">Lewati</option>
     <option value="attending" ${attending?'selected':''}>Hadir</option>
     <option value="declined" ${status==='declined'?'selected':''}>Tidak Hadir</option>
    </select>
    <input type="number" min="1" max="${inv.seats}" step="1" ${attending?'required':'hidden disabled'} data-bulk-rsvp-count="${id}" aria-label="Jumlah hadir ${name} · ${title}" value="${esc(currentCount(row))}" placeholder="Jumlah hadir">
   </td></tr>`;
  }).join(''):'<tr><td colspan="3">Tidak ada undangan terpilih untuk acara ini.</td></tr>';
  updateSaveButton();
 }
 function updateSaveButton(){
  if(running||finished)return;
  const count=eligible().filter(({key})=>statuses.has(key)).length;
  $('#bulk-rsvp-save').disabled=!count||!$('#bulk-rsvp-verify').checked;
  $('#bulk-rsvp-save').textContent=count?'Simpan '+count+' konfirmasi':'Simpan konfirmasi massal';
 }
 function open(scope){
  if(!selected.size){toast('Pilih beberapa undangan terlebih dahulu.');return;}
  running=false;finished=false;counts.clear();statuses.clear();form.reset();
  $('#bulk-rsvp-result').hidden=true;$('#bulk-rsvp-result').innerHTML='';
  $('#bulk-rsvp-error').textContent='';$('#bulk-rsvp-progress').textContent='';
  $('#bulk-rsvp-verify').checked=false;
  const filter=$(scope==='archive'?'#archive-event':'#event-filter').value;
  const mostRelevant=context.events
   .map(event=>({id:event.id,score:allInvites().filter(inv=>inv.eventIds.includes(event.id)).length}))
   .sort((a,b)=>b.score-a.score)[0]?.id;
  const defaultEvent=context.events.some(event=>event.id===filter)?filter:mostRelevant;
  eventPicker.innerHTML=context.events.map(event=>`<label class="checkbox-row"><input type="checkbox" value="${esc(event.id)}" ${event.id===defaultEvent?'checked':''}>${esc(event.title)}</label>`).join('');
  $('#bulk-rsvp-selection-info').textContent=selected.size+' undangan dipilih (maksimum '+limit+'). Centang semua acara yang ingin dikonfirmasi.';
  modal.showModal();showPreview();
 }
 for(const scope of ['guest','archive']){
  $('#'+scope+'-bulk-select-visible').addEventListener('click',()=>selectVisible(scope));
  $('#'+scope+'-bulk-clear').addEventListener('click',()=>{selected.clear();sync();});
  $('#'+scope+'-bulk-rsvp-open').addEventListener('click',()=>open(scope));
 }
 document.addEventListener('change',event=>{
  const input=event.target.closest('[data-bulk-rsvp-select]');
  if(!input)return;
  const id=input.dataset.bulkRsvpSelect;
  if(input.checked){
   if(selected.size>=limit&&!selected.has(id)){input.checked=false;toast('Maksimum '+limit+' undangan per proses.');return;}
   if(context.invitations.some(inv=>inv.id===id&&inv.active))selected.add(id);
  }else selected.delete(id);
  sync();
 });
 eventPicker.addEventListener('change',()=>{$('#bulk-rsvp-verify').checked=false;showPreview();});
 $('#bulk-rsvp-verify').addEventListener('change',updateSaveButton);
 $('#bulk-rsvp-review-rows').addEventListener('change',event=>{
  const select=event.target.closest('[data-bulk-rsvp-status]');
  if(!select)return;
  const key=select.closest('tr').dataset.bulkRsvpKey;
  if(select.value)statuses.set(key,select.value);
  else statuses.delete(key);
  const count=select.closest('td').querySelector('[data-bulk-rsvp-count]');
  const attending=select.value==='attending';
  count.hidden=!attending;
  count.disabled=!attending;
  count.required=attending;
  $('#bulk-rsvp-verify').checked=false;
  updateSaveButton();
 });
 $('#bulk-rsvp-review-rows').addEventListener('input',event=>{
  const input=event.target.closest('[data-bulk-rsvp-count]');
  if(!input)return;
  counts.set(input.closest('tr').dataset.bulkRsvpKey,input.value);
  $('#bulk-rsvp-verify').checked=false;
  updateSaveButton();
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(running||finished)return;
  const source=form.elements.source.value,note=form.elements.note.value.trim();
  const jobs=eligible().filter(({key})=>statuses.has(key)).map(row=>{
   const {inv,event,key}=row;
   const status=statuses.get(key);
   return {...row,status,count:status==='attending'?Number(currentCount(row)):0,expectedUpdatedAt:response(inv,event.id)?.updated_at||null};
  });
  if(!jobs.length||!$('#bulk-rsvp-verify').checked){
   $('#bulk-rsvp-error').textContent='Pilih status untuk undangan yang ingin diproses, lalu centang pemeriksaan sebelum menyimpan.';
   return;
  }
  if(jobs.some(job=>job.status==='attending'&&(!Number.isInteger(job.count)||job.count<1||job.count>job.inv.seats))){
   $('#bulk-rsvp-error').textContent='Isi jumlah hadir yang valid untuk setiap undangan (minimal 1, maksimal sesuai kuota).';
   return;
  }
  // Release seats before restoring attendance in the same batch.
  jobs.sort((a,b)=>Number(a.status==='attending')-Number(b.status==='attending'));
  running=true;$('#bulk-rsvp-save').disabled=true;$('#bulk-rsvp-error').textContent='';
  const saved=[],failed=[],reassigned=[],unchanged=[];
  for(let n=0;n<jobs.length;n++){
   const job=jobs[n],label=display(job.inv)+' · '+job.event.title;
   $('#bulk-rsvp-progress').textContent='Memproses '+(n+1)+' dari '+jobs.length+': '+label;
   try{
    const result=await apiCall(job.inv.id,{eventId:job.event.id,status:job.status,guestCount:job.count,expectedUpdatedAt:job.expectedUpdatedAt,source,note});
    if(result.unchanged)unchanged.push(label);
    else saved.push(label);
    if(result.seatReassignmentRequired)reassigned.push(label);
   }catch(error){
    failed.push({id:job.inv.id,name:label,error:error.message});
   }
  }
  const failedInvitations=new Set(failed.map(item=>item.id));
  for(const {inv} of jobs)if(!failedInvitations.has(inv.id))selected.delete(inv.id);
  finished=true;
  try{await refresh();}catch(error){$('#bulk-rsvp-error').textContent='Konfirmasi sudah diproses, tetapi pemuatan ulang gagal: '+error.message;}
  running=false;
  $('#bulk-rsvp-progress').textContent='Selesai: '+saved.length+' diperbarui, '+unchanged.length+' sudah sesuai, '+failed.length+' gagal.';
  $('#bulk-rsvp-result').hidden=false;
  $('#bulk-rsvp-result').innerHTML=
   '<h3>Hasil konfirmasi massal</h3><p>'+saved.length+' konfirmasi berhasil diperbarui; '+unchanged.length+' tanpa perubahan; '+failed.length+' gagal.</p>'+
   (reassigned.length?'<p class="capacity-warning over-capacity">Perlu alokasi meja baru: '+reassigned.map(esc).join(', ')+'</p>':'')+
   (failed.length?'<h4>Belum diproses (tetap dipilih)</h4><ul>'+failed.map(item=>'<li><strong>'+esc(item.name)+'</strong>: '+esc(item.error)+'</li>').join('')+'</ul><p>Tutup dialog, segarkan jika diperlukan, lalu ulangi hanya acara yang gagal.</p>':'');
  $('#bulk-rsvp-save').disabled=true;$('#bulk-rsvp-save').textContent='Proses selesai';
  sync();
 });
 async function apiCall(id,payload){
  const response=await fetch('/api/admin/invitations/'+encodeURIComponent(id)+'/rsvp',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let result;try{result=await response.json();}catch{throw new Error('Respons server tidak dapat dibaca.');}
  if(!response.ok)throw new Error(result.error||'Gagal menyimpan konfirmasi ('+response.status+').');
  return result;
 }
 modal.addEventListener('cancel',event=>{if(running)event.preventDefault();});
 modal.addEventListener('click',event=>{if(running&&event.target.closest('[data-close]'))event.stopImmediatePropagation();},true);
 window.weddingBulkRsvp={setContext,sync};
})();
