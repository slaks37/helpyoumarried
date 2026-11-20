/* A single motion layer for the invitation, including dynamically rendered cards. */
(()=>{
 const body=document.body,gate=document.querySelector('#music-gate');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const fine=matchMedia('(hover: hover) and (pointer: fine)');
 const hero=document.querySelector('.hero-visual');
 const background=[...document.querySelectorAll('header,main,footer,.skip-link,.effect-controls,.floating-love-button')];
 const motionPhotos=new Set();let opened=false,frame=0,openingTimer;
 body.classList.add('music-gate-open','wedding-intro');
 background.forEach(el=>el.inert=true);
 const buttons=[...gate.querySelectorAll('button')];
 gate.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}
  else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
 });
 buttons[0].focus({preventScroll:true});
 function finishOpening(){
  clearTimeout(openingTimer);gate.hidden=true;gate.classList.remove('splash-leaving');
  body.classList.remove('music-gate-open','wedding-intro');
  background.forEach(el=>el.inert=false);
  window.scrollTo({top:0,left:0,behavior:'instant'});
  document.querySelector('.open-invitation').focus({preventScroll:true});
  hero.classList.add('hero-unrolling');
  setTimeout(()=>hero.classList.remove('hero-unrolling'),2500);
  queueParallax();
 }
 window.openWeddingMotion=()=>{
  if(opened)return;opened=true;
  gate.classList.add('splash-leaving');
  if(reduce.matches)finishOpening();else openingTimer=setTimeout(finishOpening,950);
 };
 const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(entry.target.classList.contains('reveal')&&entry.isIntersecting)entry.target.classList.add('is-visible');
   if(entry.target.classList.contains('living-photo')){
    entry.target.classList.toggle('photo-awake',entry.isIntersecting);
    if(entry.isIntersecting)motionPhotos.add(entry.target);else motionPhotos.delete(entry.target);
   }
  }
  queueParallax();
 },{threshold:.06,rootMargin:'0px 0px -20px 0px'}):null;
 window.weddingObserveMotion=(root=document)=>{
  root.querySelectorAll('.reveal,.gallery-item,.event-card,.rsvp-paper,.rsvp-section>.section-heading,.guestbook-section>.section-heading,.guestbook-heading,.guestbook-paper,.closing-content,.invitation>.section-heading,.memo,.forever-note>p').forEach((el,i)=>{
   if(el.dataset.motionObserved)return;
   el.dataset.motionObserved='true';el.classList.add('reveal');
   el.style.setProperty('--reveal-delay',`${Math.min(i%3,2)*85}ms`);
   if(observer)observer.observe(el);else el.classList.add('is-visible');
  });
  root.querySelectorAll('.hero-visual,.couple-photo,.gallery-item button,.closing').forEach(el=>{
   if(el.classList.contains('living-photo'))return;
   el.classList.add('living-photo');
   if(observer)observer.observe(el);else {el.classList.add('photo-awake');motionPhotos.add(el);}
   if(fine.matches&&el.matches('.couple-photo,.gallery-item button')){
    el.addEventListener('pointermove',event=>{
     if(reduce.matches)return;const rect=el.getBoundingClientRect();
     el.style.setProperty('--tilt-x',`${((event.clientY-rect.top)/rect.height-.5)*-3}deg`);
     el.style.setProperty('--tilt-y',`${((event.clientX-rect.left)/rect.width-.5)*3}deg`);
    },{passive:true});
    el.addEventListener('pointerleave',()=>{el.style.setProperty('--tilt-x','0deg');el.style.setProperty('--tilt-y','0deg');});
   }
  });
 };
 function updateParallax(){
  frame=0;if(reduce.matches||document.hidden)return;
  const height=window.innerHeight;
  for(const el of motionPhotos){
   if(!el.isConnected){motionPhotos.delete(el);continue;}
   const rect=el.getBoundingClientRect();
   const progress=Math.max(-1,Math.min(1,(height/2-rect.top-rect.height/2)/height));
   el.style.setProperty('--photo-parallax',`${(progress*(el===hero?55:30)).toFixed(1)}px`);
  }
 }
 function queueParallax(){if(!frame&&!reduce.matches)frame=requestAnimationFrame(updateParallax);}
 window.addEventListener('scroll',queueParallax,{passive:true});
 window.addEventListener('resize',queueParallax,{passive:true});
 document.addEventListener('visibilitychange',()=>{body.classList.toggle('motion-paused',document.hidden);queueParallax();});
 reduce.addEventListener('change',()=>{
  document.querySelectorAll('.living-photo').forEach(el=>el.style.setProperty('--photo-parallax','0px'));
  if(reduce.matches&&opened&&!gate.hidden)finishOpening();queueParallax();
 });
 body.classList.add('js-reveal');window.weddingObserveMotion();
 window.addEventListener('pagehide',()=>{if(frame)cancelAnimationFrame(frame);frame=0;});
 window.addEventListener('pageshow',queueParallax);
})();
