(async()=>{
 await window.weddingContentReady;
 const context=await window.weddingGuestReady,$=s=>document.querySelector(s),ui=window.weddingUi,esc=htmlEscape;
 const form=$('#guestbook-form'),status=$('#guestbook-status'),list=$('#guestbook-messages'),submit=form.querySelector('[type=submit]');
 let page=1,loading=false,requestId=crypto.randomUUID(),signature='';
 window.addEventListener('wedding-rsvp-saved',event=>{if(!form.elements.name.value&&!form.elements.name.readOnly)form.elements.name.value=event.detail.name;});
 async function api(path,body){const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const value=await response.json();if(!response.ok)throw new Error(window.weddingLanguage==='en'?'Please try again in a moment.':value.error||'Silakan coba lagi.');return value;}
 function render(messages){
  list.replaceChildren();
  if(!messages.length){const empty=document.createElement('p');empty.className='guestbook-empty';empty.textContent=ui('Jadilah yang pertama menitipkan pesan hangat.','Be the first to leave a warm wish.');list.append(empty);return;}
  for(const message of messages){
   const card=document.createElement('article');card.className='guestbook-card';
   const translated=window.weddingLanguage==='en'?message.translationEn:message.translationId;
   const date=new Intl.DateTimeFormat(window.weddingLanguage==='en'?'en-US':'id-ID',{dateStyle:'medium'}).format(new Date(message.createdAt));
   card.innerHTML=`<header><h3 dir="auto">${esc(message.name)}</h3><time datetime="${esc(message.createdAt)}">${esc(date)}</time></header><small>${ui('Pesan asli','Original message')}</small><p class="guestbook-original" dir="auto">${esc(message.original)}</p>${translated&&translated.trim()!==message.original.trim()?`<div class="guestbook-translation"><small>${ui('Terjemahan otomatis · Indonesia','Automatic translation · English')}</small><p dir="auto">${esc(translated)}</p></div>`:''}`;
   list.append(card);
  }
 }
 async function loadPage(next){
  if(loading)return;loading=true;$('#guestbook-prev').disabled=true;$('#guestbook-next').disabled=true;$('#guestbook-retry').hidden=true;list.setAttribute('aria-busy','true');
  try{const result=await api('/api/messages?page='+next);page=result.page;render(result.messages);$('#guestbook-page').textContent=ui('Halaman ','Page ')+page;$('#guestbook-prev').disabled=page<=1;$('#guestbook-next').disabled=!result.hasMore;}
  catch{if(!list.children.length)list.textContent=ui('Buku pesan belum dapat dimuat.','The guestbook could not be loaded.');$('#guestbook-retry').hidden=false;}
  finally{loading=false;list.removeAttribute('aria-busy');}
 }
 $('#guestbook-prev').setAttribute('aria-label',ui('20 pesan sebelumnya','Previous 20 messages'));$('#guestbook-next').setAttribute('aria-label',ui('20 pesan berikutnya','Next 20 messages'));
 $('#guestbook-retry').textContent=ui('Coba lagi','Try again');$('#guestbook-prev').addEventListener('click',()=>loadPage(page-1));$('#guestbook-next').addEventListener('click',()=>loadPage(page+1));$('#guestbook-retry').addEventListener('click',()=>loadPage(page));
 try{
  const visitor=await api('/api/visitor'+(context?.authorized&&context.slug?'?slug='+encodeURIComponent(context.slug):''));
  if(visitor.name){form.elements.name.value=visitor.name;form.elements.name.readOnly=true;}else form.elements.name.value=visitor.rsvp?.name||'';
  submit.disabled=false;
  if(visitor.preview)status.textContent=ui('Pratinjau admin: pesan tidak dikirim dari halaman ini.','Admin preview: messages are not sent from this page.');
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(visitor.preview){status.textContent=ui('Buka tautan tamu di browser lain untuk mencoba mengirim pesan.','Open a guest link in another browser to try submitting a message.');return;}
   const payload={name:form.elements.name.value.trim(),message:form.elements.message.value.trim(),slug:visitor.invitation?.slug||''};
   const nextSignature=JSON.stringify(payload);if(signature!==nextSignature){signature=nextSignature;requestId=crypto.randomUUID();}
   submit.disabled=true;status.textContent=ui('Menitipkan pesan…','Sending your wishes…');
   try{const result=await api('/api/messages',{...payload,requestId});if(!result.saved)throw new Error(ui('Pesan belum tersimpan.','Your message was not saved.'));form.elements.message.value='';signature='';status.textContent=ui('Terima kasih, pesan sudah kami terima. ♡','Thank you, we have received your message. ♡');await loadPage(1);}
   catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
  });
 }catch{status.textContent=ui('Formulir belum siap. Muat ulang halaman untuk mencoba lagi.','The form is not ready. Reload the page to try again.');}
 await loadPage(1);
})();
