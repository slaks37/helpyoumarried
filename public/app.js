if(/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(location.pathname)){
 history.scrollRestoration='manual';
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 const startAtTop=()=>window.scrollTo({top:0,left:0,behavior:'instant'});
 startAtTop();window.addEventListener('pageshow',event=>{if(event.persisted)startAtTop();});
}
const menuButton=document.querySelector('.menu-toggle');
const menu=document.querySelector('#mobile-menu');
menuButton.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Tutup menu':'Buka menu');});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');}));

const photoData=window.WEDDING_CONTENT_DEFAULTS.photos.map(p=>({...p}));
const defaultTexts=window.WEDDING_CONTENT_DEFAULTS.texts;
let contentTexts={...defaultTexts},guestSalutation='';
const locale=()=>window.weddingLanguage==='en'?'en-US':'id-ID';
const ui=(id,en)=>window.weddingUi?window.weddingUi(id,en):id;
window.weddingRecipientName=invite=>window.weddingDisplayName(invite,window.weddingLanguage);
const guestCopyKeys=new Set(['invitationIntro','memoBody','coupleBody2','galleryIntro','eventsIntro','rsvpHeadingAccent','rsvpIntro','rsvpAccessNote','rsvpLockedNote','rsvpYesBody','rsvpNoBody','rsvpYesTitle','rsvpNoTitle','giftIntro','giftAccessNote','giftLockedNote','closingBody','closingHeadingAccent','rsvpCalendarIntro']);
const copy=key=>{const value=contentTexts[key]??defaultTexts[key];if(window.weddingLanguage==='en'||typeof value!=='string'||!guestCopyKeys.has(key))return value;const address=guestSalutation||'Saudara/Saudari';return value.replace(/Bapak\/Ibu\/Saudara\/Saudari|Bapak\/Ibu\/Saudara\/i|Saudara\/Saudari/gi,address).replace(/\b(?:Anda|anda|Kamu|kamu)\b/g,address).replace(/\b(kehadiran|untuk|kabar|doa|bersama|menyambut|cerita|hati|kursi|nama|pesan|cinta|waktu|foto|hidup|rumah|langkah)mu\b/gi,(_,stem)=>`${stem} ${address}`);};
window.weddingCopy=copy;
window.setWeddingRecipient=invite=>{guestSalutation=window.weddingAddress(invite);document.querySelectorAll('[data-cms]').forEach(el=>{const value=copy(el.dataset.cms);if(typeof value==='string')el.textContent=value;});window.setRsvpSeats(invitationSeats);};
const photoCaption=photo=>window.weddingLanguage==='en'?(photo.captionEn||photo.caption):photo.caption;
const photoAlt=photo=>window.weddingLanguage==='en'?(photo.altEn||window.WEDDING_ENGLISH_PHOTO_ALTS[photo.id]||photo.alt):photo.alt;
const photoPath=(id,thumb=false)=>{const src=photoData.find(p=>p.id===id)?.src||'';return thumb&&/^\/assets\/photo-\d{2}(?:-new)?\.webp$/.test(src)?src.replace('/photo-','/thumb-'):src;};
let currentFilter='all',expanded=false,activePhotos=photoData;
const gallery=document.querySelector('#gallery-grid'),moreButton=document.querySelector('#more-photos');
function renderGallery(){
 activePhotos=photoData.filter(photo=>currentFilter==='all'||photo.category===currentFilter);
 const visible=expanded?activePhotos:activePhotos.slice(0,6);
 gallery.replaceChildren();
 visible.forEach(photo=>{
  const figure=document.createElement('figure');figure.className='gallery-item';
  const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`${ui('Lihat foto','View photo')} ${photo.id}: ${photoAlt(photo)}`);
  const img=document.createElement('img');img.src=photoPath(photo.id,true);img.alt=photoAlt(photo);img.width=700;img.height=900;img.loading='lazy';img.decoding='async';
  const expandIcon=document.createElement('span');expandIcon.textContent='↗';expandIcon.setAttribute('aria-hidden','true');
  button.append(img,expandIcon);button.addEventListener('click',()=>openLightbox(photo.id));
  const caption=document.createElement('figcaption');const label=document.createElement('span');label.textContent=photoCaption(photo);const index=document.createElement('span');index.textContent=String(photo.id).padStart(2,'0');caption.append(label,index);figure.append(button,caption);gallery.append(figure);
 });
 window.weddingObserveMotion?.(gallery);
 document.querySelector('#gallery-status').textContent=`${visible.length} ${ui('dari','of')} ${activePhotos.length} ${ui('momen','photos')}`;
 moreButton.hidden=activePhotos.length<=6;moreButton.replaceChildren(document.createTextNode(copy(expanded?'galleryLess':'galleryMore').replace(/\b\d+\b/g,String(activePhotos.length))+' '));const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent=expanded?'↑':'↓';moreButton.append(arrow);
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 currentFilter=button.dataset.filter;expanded=false;
 document.querySelectorAll('[data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));renderGallery();
}));
moreButton.addEventListener('click',()=>{expanded=!expanded;renderGallery();if(!expanded)document.querySelector('#momen').scrollIntoView({behavior:motionEnabled?'smooth':'instant'});});
renderGallery();
const lightbox=document.querySelector('#lightbox'),lightboxImg=document.querySelector('#lightbox-image');let lightboxIndex=0,lastFocus;
function showLightboxPhoto(){const p=activePhotos[lightboxIndex];lightboxImg.src=photoPath(p.id);lightboxImg.alt=photoAlt(p);document.querySelector('#lightbox-caption').textContent=photoCaption(p);document.querySelector('#lightbox-count').textContent=`${String(lightboxIndex+1).padStart(2,'0')} / ${String(activePhotos.length).padStart(2,'0')}`;}
function openLightbox(id){lastFocus=document.activeElement;lightboxIndex=activePhotos.findIndex(p=>p.id===id);showLightboxPhoto();lightbox.showModal();document.body.classList.add('modal-open');document.querySelector('#close-lightbox').focus();}
function moveLightbox(delta){lightboxIndex=(lightboxIndex+delta+activePhotos.length)%activePhotos.length;showLightboxPhoto();}
document.querySelector('#close-lightbox').addEventListener('click',()=>lightbox.close());
lightbox.addEventListener('close',()=>{document.body.classList.remove('modal-open');lastFocus?.focus();});
document.querySelector('#lightbox-prev').addEventListener('click',()=>moveLightbox(-1));document.querySelector('#lightbox-next').addEventListener('click',()=>moveLightbox(1));
lightbox.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();moveLightbox(-1);}if(e.key==='ArrowRight'){e.preventDefault();moveLightbox(1);}});
lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close();});
let touchX=0,touchY=0;
lightboxImg.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;touchY=e.changedTouches[0].clientY;},{passive:true});
lightboxImg.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))moveLightbox(dx<0?1:-1);},{passive:true});

const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let motionEnabled=!reducedMotion.matches;
function hearts(x,y,count=8){if(!motionEnabled||reducedMotion.matches)return;const layer=document.querySelector('#hearts');for(let i=0;i<count;i++){const heart=document.createElement('span');heart.className='heart-particle';heart.textContent=i%3?'♡':'♥';
 heart.style.left=`${x+(Math.random()-.5)*110}px`;heart.style.top=`${y+(Math.random()-.5)*30}px`;heart.style.fontSize=`${14+Math.random()*18}px`;heart.style.setProperty('--drift',`${(Math.random()-.5)*150}px`);heart.style.animationDelay=`${Math.random()*.4}s`;layer.append(heart);setTimeout(()=>heart.remove(),3400);}}
reducedMotion.addEventListener('change',()=>{motionEnabled=!reducedMotion.matches;if(reducedMotion.matches){document.querySelector('#hearts').replaceChildren();setSlidePlaying(false);}else setSlidePlaying(true);});
document.querySelector('.open-invitation').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();hearts(r.x+r.width/2,r.y+r.height/2,12);});
document.querySelector('#tap-heart').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();hearts(r.x+r.width/2,r.y,10);});
const music=document.querySelector('#background-music');
const musicButton=document.querySelector('#music-toggle');
const musicGate=document.querySelector('#music-gate');
let musicPausedByGuest=false;
music.volume=.65;
function updateMusicButton(){
 const playing=!music.paused;
 musicButton.setAttribute('aria-pressed',String(playing));
 musicButton.setAttribute('aria-label',playing?ui('Jeda musik Falling In Love','Pause Falling In Love music'):ui('Putar musik Falling In Love','Play Falling In Love music'));
 document.querySelector('#music-state').textContent=playing?ui('jeda','pause'):ui('putar','play');
}
function showMusicGate(){
 if(musicPausedByGuest||!music.paused||!musicGate.hidden)return;
 musicGate.hidden=false;
 document.body.classList.add('music-gate-open');
 document.querySelector('#enter-with-music').focus();
}
function closeMusicGate(){
 if(window.openWeddingMotion)window.openWeddingMotion();
 else{musicGate.hidden=true;document.body.classList.remove('music-gate-open');}
}
function startMusic(showGateIfBlocked=false){
 if(musicPausedByGuest||!music.paused)return;
 music.play().catch(error=>{
  updateMusicButton();
  if(showGateIfBlocked&&error.name==='NotAllowedError')showMusicGate();
 });
}
music.addEventListener('play',updateMusicButton);
music.addEventListener('pause',updateMusicButton);
document.querySelector('#enter-with-music').addEventListener('click',()=>{
 closeMusicGate();
 musicPausedByGuest=false;
 startMusic();
});
document.querySelector('#enter-without-music').addEventListener('click',()=>{
 musicPausedByGuest=true;
 closeMusicGate();
});
musicButton.addEventListener('click',()=>{
 if(music.paused){musicPausedByGuest=false;startMusic();}
 else{musicPausedByGuest=true;music.pause();}
});
document.querySelector('.open-invitation').addEventListener('click',()=>startMusic());
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#music-toggle, #music-gate'))startMusic();});
document.addEventListener('keydown',e=>{if(e.key!=='Tab'&&!e.target.closest('#music-toggle, #music-gate'))startMusic();});
startMusic(true);
const giftTrigger=document.querySelector('#send-love'),giftDialog=document.querySelector('#gift');
let giftUnlocked=false,giftScrollQueued=false;
function updateGiftTrigger(){giftScrollQueued=false;if(!musicGate.hidden){giftTrigger.hidden=true;return;}if(!giftUnlocked&&document.querySelector('#undangan').getBoundingClientRect().top<=window.innerHeight*.65)giftUnlocked=true;giftTrigger.hidden=!giftUnlocked||giftDialog.open;}
window.addEventListener('scroll',()=>{if(!giftScrollQueued){giftScrollQueued=true;requestAnimationFrame(updateGiftTrigger);}},{passive:true});
window.addEventListener('resize',updateGiftTrigger);updateGiftTrigger();
let giftOpener=giftTrigger;
function openGiftDialog(source='floating'){if(giftDialog.open)return;giftOpener=source==='rsvp'?document.querySelector('#rsvp-send-love'):giftTrigger;giftTrigger.hidden=true;window.trackWeddingGiftActivity?.('opened',source);giftDialog.showModal();document.body.classList.add('modal-open');document.querySelector('#close-gift-dialog').focus();const r=giftTrigger.getBoundingClientRect();hearts(r.x+r.width/2,r.y,12);}
giftTrigger.addEventListener('click',()=>openGiftDialog('floating'));
document.querySelector('#rsvp-send-love').addEventListener('click',()=>openGiftDialog('rsvp'));
document.querySelector('#close-gift-dialog').addEventListener('click',()=>giftDialog.close());
giftDialog.addEventListener('click',event=>{if(event.target===giftDialog)giftDialog.close();});
giftDialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');updateGiftTrigger();giftOpener.focus();});
document.querySelectorAll('[data-gift-copy]').forEach(button=>button.addEventListener('click',async()=>{
 const card=button.closest('.gift-bank-card'),number=card.querySelector('.gift-bank-number'),status=card.querySelector('.gift-copy-status'),source=button.dataset.giftSource;
 window.trackWeddingGiftActivity?.('copy_clicked',source);
 try{await navigator.clipboard.writeText(number.textContent.trim());status.textContent=ui('Nomor rekening tersalin ♡','Account number copied ♡');window.trackWeddingGiftActivity?.('account_copied',source);}
 catch{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(number);selection.removeAllRanges();selection.addRange(range);status.textContent=ui('Nomor disorot, silakan salin.','Account number selected. Please copy it.');}
}));

let heroSlides=[photoData[13],photoData[1],photoData[6]];let heroIndex=0,slideTimer=null,slidesPlaying=false;
const heroImage=document.querySelector('#hero-photo'),slidePlayButton=document.querySelector('#pause-slides');
function setHeroSlide(delta){heroIndex=(heroIndex+delta+heroSlides.length)%heroSlides.length;const p=heroSlides[heroIndex];heroImage.src=photoPath(p.id);heroImage.alt=photoAlt(p);document.querySelector('#slide-number').innerHTML=`${String(heroIndex+1).padStart(2,'0')} <i>/ ${String(heroSlides.length).padStart(2,'0')}</i>`;}
function setSlidePlaying(play){clearInterval(slideTimer);slidesPlaying=play;slidePlayButton.textContent=play?'Ⅱ':'▷';slidePlayButton.setAttribute('aria-label',play?ui('Jeda slideshow','Pause slideshow'):ui('Putar slideshow','Play slideshow'));slidePlayButton.setAttribute('aria-pressed',String(play));if(play)slideTimer=setInterval(()=>{if(!document.hidden&&!lightbox.open)setHeroSlide(1);},6500);}
document.querySelector('#previous-slide').addEventListener('click',()=>{setSlidePlaying(false);setHeroSlide(-1);});document.querySelector('#next-slide').addEventListener('click',()=>{setSlidePlaying(false);setHeroSlide(1);});slidePlayButton.addEventListener('click',()=>setSlidePlaying(!slidesPlaying));
setSlidePlaying(motionEnabled&&!reducedMotion.matches);
let heroTouchStart=0;heroImage.addEventListener('touchstart',e=>{heroTouchStart=e.changedTouches[0].clientX;},{passive:true});heroImage.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-heroTouchStart;if(Math.abs(dx)>65){setSlidePlaying(false);setHeroSlide(dx<0?1:-1);}},{passive:true});


const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentEvents=[],countdownInterval;
const dateFormat=()=>new Intl.DateTimeFormat(locale(),{dateStyle:'full',timeZone:'Asia/Jakarta'});
const timeFormat=()=>new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});
const eventDateLabel=e=>e.time?e.time:e.start?`${dateFormat().format(new Date(e.start))} · ${timeFormat().format(new Date(e.start))}${e.end?'–'+timeFormat().format(new Date(e.end)):''} ${ui('WIB','Jakarta time')}`:dateFormat().format(new Date(e.date+'T12:00:00+07:00'))+ui(' · Waktu menyusul',' · Time to be announced');
window.weddingEventDateLabel=eventDateLabel;
let reminderEventIds=[];
function updateReminder(){
 const events=currentEvents.filter(e=>e.start&&reminderEventIds.includes(e.id)),hasReminder=events.length>0;
 document.querySelector('#rsvp-calendar').hidden=!hasReminder;document.querySelector('#calendar-reminder').hidden=!hasReminder;
 const box=document.querySelector('#rsvp-calendar-links');box.replaceChildren();box.hidden=!hasReminder;
 const utc=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 for(const event of events){const link=document.createElement('a'),end=event.end||new Date(Date.parse(event.start)+7200000).toISOString();const params=new URLSearchParams({action:'TEMPLATE',text:'(nama pria) & (nama wanita) — '+window.weddingEventTitle(event),dates:utc(event.start)+'/'+utc(end),ctz:'Asia/Jakarta',location:[event.venue,event.address].filter(Boolean).join(', '),details:ui('Mohon atur pengingat 7 hari, 1 hari, dan 1 jam sebelum acara.','Please set reminders 7 days, 1 day, and 1 hour before the event.')});link.href='https://calendar.google.com/calendar/render?'+params;link.target='_blank';link.rel='noopener noreferrer';link.className='button';link.textContent='Google Calendar · '+window.weddingEventTitle(event)+' ↗';box.append(link);}
}
window.setWeddingReminder=function(ids){reminderEventIds=Array.isArray(ids)?ids:[];updateReminder();};
let invitationSeats=null;
window.setRsvpSeats=function(seats){invitationSeats=Number.isInteger(seats)?seats:null;const template=copy('rsvpHeading');document.querySelector('#rsvp-seat-heading').textContent=invitationSeats?template.includes('{seats}')?template.replaceAll('{seats}',String(invitationSeats)):`${invitationSeats} ${ui('kursi','seats')}`:ui('Kami menyiapkan kursi','We saved a place');};
window.renderWeddingEvents=function(events){
 currentEvents=events;
 document.querySelector('#event-cards').innerHTML=events.map((e,i)=>`<article class="event-card" data-event="${htmlEscape(e.id)}"><div class="event-label"><span>${htmlEscape(copy(e.id==='ceremony'?'eventPromiseLabel':'eventCelebrationLabel'))}</span><span>0${i+1}</span></div><h3>${htmlEscape(window.weddingEventTitle(e))}</h3><p class="event-time">${eventDateLabel(e).split(" · ").map(part=>`<span>${htmlEscape(part)}</span>`).join("")}</p><div class="event-rule"></div><h4 class="event-venue">${htmlEscape(e.venue)}</h4><p class="event-address">${htmlEscape(e.address)}</p>${e.mapsUrl?`<a class="map-link" href="${htmlEscape(e.mapsUrl)}" target="_blank" rel="noopener noreferrer">${htmlEscape(copy('eventMapButton'))} <span aria-hidden="true">↗</span></a>`:e.mapsUrl===null&&!e.address?'':`<span class="map-pending">${htmlEscape(copy('eventMapPending'))}</span>`}</article>`).join('');
 window.weddingObserveMotion?.(document.querySelector('#event-cards'));
 const main=events.find(e=>e.start);clearInterval(countdownInterval);
 if(main){const target=new Date(main.start);document.querySelector('#wedding-date').textContent=dateFormat().format(target);const countDown=document.querySelector('#countdown');
 const tick=()=>{const difference=target-Date.now();if(difference<=0){countDown.hidden=true;document.querySelector('#date-note').textContent=copy('dateNoteFinished');return;}countDown.hidden=false;document.querySelector('#date-note').textContent=copy('dateNoteUpcoming');document.querySelector('#days').textContent=Math.floor(difference/86400000);document.querySelector('#hours').textContent=String(Math.floor(difference/3600000)%24).padStart(2,'0');document.querySelector('#minutes').textContent=String(Math.floor(difference/60000)%60).padStart(2,'0');document.querySelector('#seconds').textContent=String(Math.floor(difference/1000)%60).padStart(2,'0');};tick();countdownInterval=setInterval(tick,1000);}
 if(!main){document.querySelector('#countdown').hidden=true;document.querySelector('#wedding-date').textContent=events.some(e=>e.time)?'[waktu]':(events.length?dateFormat().format(new Date(events[0].date+'T12:00:00+07:00')):'');document.querySelector('#date-note').textContent=events.some(e=>e.time)?'':(events.length?copy('dateNotePending'):'');}
 updateReminder();
};
if(window.WEDDING?.events)window.renderWeddingEvents(Object.values(window.WEDDING.events));
document.querySelector('#save-calendar').addEventListener('click',()=>{
 const escapeICS=s=>String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
 const utc=s=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//(nama pria) (nama wanita)//Wedding//ID','CALSCALE:GREGORIAN'];
 currentEvents.filter(e=>e.start&&reminderEventIds.includes(e.id)).forEach(e=>{lines.push('BEGIN:VEVENT',`UID:sj-${e.id}-${e.date}@wedding.local`,`DTSTAMP:${utc(new Date().toISOString())}`,`DTSTART:${utc(e.start)}`);lines.push(`DTEND:${utc(e.end||new Date(new Date(e.start).getTime()+2*3600000).toISOString())}`);lines.push(`SUMMARY:${escapeICS('(nama pria) & (nama wanita) — '+window.weddingEventTitle(e))}`,`LOCATION:${escapeICS([e.venue,e.address].filter(Boolean).join(', '))}`,`DESCRIPTION:${escapeICS(ui('Undangan pernikahan (nama pria) & (nama wanita).','Wedding invitation of (nama pria) & (nama wanita).'))}`);for(const [trigger,description] of [['-P7D',ui('7 hari','7 days')],['-P1D',ui('1 hari','1 day')],['-PT1H',ui('1 jam','1 hour')]])lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeICS(ui('Pengingat '+description+' sebelum '+window.weddingEventTitle(e),'Reminder '+description+' before '+window.weddingEventTitle(e)))}`,`TRIGGER:${trigger}`,'END:VALARM');lines.push('END:VEVENT');});lines.push('END:VCALENDAR');const file=URL.createObjectURL(new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=file;a.download='Pengingat-7hari-1hari-1jam.ics';a.click();setTimeout(()=>URL.revokeObjectURL(file),1000);
});
const ambient=document.querySelector('#ambient-hearts');
for(let n=0;n<12;n++){const el=document.createElement('span');el.className='ambient-heart';el.textContent=n%3?'♡':'✧';el.style.setProperty('--left',`${8+Math.random()*84}%`);el.style.setProperty('--delay',`${-Math.random()*18}s`);el.style.setProperty('--duration',`${13+Math.random()*13}s`);el.style.setProperty('--size',`${12+Math.random()*15}px`);ambient.append(el);}
window.addEventListener('pagehide',()=>{clearInterval(slideTimer);clearInterval(countdownInterval);});

function translateStaticUi(){
 const en=window.weddingLanguage==='en';
 const labels={navInvitation:['Undangan','Invitation'],navCouple:['Mempelai','The couple'],navGallery:['Momen kami','Our moments'],navEvents:['Hari bahagia','The day'],navMenu:['Menu','Menu'],navWishes:['Buku pesan','Guestbook'],skip:['Langsung ke undangan','Skip to invitation'],days:['HARI','DAYS'],hours:['JAM','HOURS'],minutes:['MENIT','MINUTES'],seconds:['DETIK','SECONDS'],music:['Musik','Music']};
 for(const [key,pair] of Object.entries(labels))document.querySelectorAll(`[data-ui="${key}"]`).forEach(node=>node.textContent=pair[en?1:0]);
 const aria={'.menu-toggle':['Buka menu','Open menu'],'#previous-slide':['Foto sebelumnya','Previous photo'],'#next-slide':['Foto berikutnya','Next photo'],'#close-lightbox':['Tutup foto','Close photo'],'#lightbox-prev':['Foto galeri sebelumnya','Previous gallery photo'],'#lightbox-next':['Foto galeri berikutnya','Next gallery photo'],'#close-gift-dialog':['Tutup hadiah','Close gift dialog']};
 for(const [selector,pair] of Object.entries(aria)){const node=document.querySelector(selector);if(node)node.setAttribute('aria-label',pair[en?1:0]);}
 updateMusicButton();slidePlayButton.setAttribute('aria-label',slidesPlaying?ui('Jeda slideshow','Pause slideshow'):ui('Putar slideshow','Play slideshow'));
}
window.applyWeddingContent=function(content){
 if(!content)return;
 const defaults=window.WEDDING_CONTENT_DEFAULTS;
 const texts=window.weddingLanguage==='en'?{...window.WEDDING_ENGLISH_TEXTS,...content.textsEn}:{...defaults.texts,...content.texts};
 contentTexts=texts;window.WEDDING_LOADED_CONTENT=content;translateStaticUi();
 document.querySelectorAll('[data-cms]').forEach(el=>{const value=copy(el.dataset.cms);if(typeof value==='string')el.textContent=value;});
 window.setRsvpSeats(invitationSeats);
 document.querySelectorAll('[data-cms-placeholder]').forEach(el=>{const value=texts[el.dataset.cmsPlaceholder];if(typeof value==='string')el.setAttribute('placeholder',value);});
 if(location.pathname==='/'||location.pathname==='/index.html'){document.querySelector('#guest-name').textContent=copy('guestFallback');document.querySelector('#memo-recipient').textContent=copy('guestFallback');}
 if(Array.isArray(content.photos)&&content.photos.length===defaults.photos.length){photoData.splice(0,photoData.length,...content.photos.map(p=>({...p})));}
 const featured=Array.isArray(content.photos)&&content.photos.length===defaults.photos.length?content.featured||defaults.featured:defaults.featured;
 heroSlides=featured.hero.map(id=>photoData.find(p=>p.id===id)).filter(Boolean);
 if(!heroSlides.length)heroSlides=defaults.featured.hero.map(id=>photoData.find(p=>p.id===id)).filter(Boolean);
 heroIndex=0;setHeroSlide(0);
 const couple=photoData.find(p=>p.id===featured.couple);if(couple){const img=document.querySelector('.couple-photo img');img.src=couple.src;img.alt=photoAlt(couple);}
 const closing=photoData.find(p=>p.id===featured.closing);if(closing){const img=document.querySelector('.closing>img');img.src=closing.src;img.alt=photoAlt(closing);}
 document.querySelector('.gallery-filters [data-filter="all"] span:last-child').textContent=photoData.length;
 expanded=false;renderGallery();
 window.renderWeddingEvents(currentEvents);
};
const contentController=new AbortController(),contentTimeout=setTimeout(()=>contentController.abort(),6000);
const contentReady=fetch('/api/content',{cache:'no-store',signal:contentController.signal}).then(r=>r.ok?r.json():null).catch(()=>null).finally(()=>clearTimeout(contentTimeout));
window.weddingContentReady=Promise.all([contentReady,window.weddingLocaleReady]).then(([result])=>window.applyWeddingContent(result?.content||{}));
setTimeout(window.revealWedding,10000);
window.addEventListener('wedding-language-change',()=>{if(window.WEDDING_LOADED_CONTENT)window.applyWeddingContent(window.WEDDING_LOADED_CONTENT);else contentTexts=window.weddingLanguage==='en'?{...window.WEDDING_ENGLISH_TEXTS}:{...defaultTexts};translateStaticUi();});
