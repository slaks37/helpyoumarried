window.weddingReadingReady=(async()=>{
 const guest=await window.weddingGuestReady;
 if(!guest?.authorized||guest.preview)return;
 const sections=['home','undangan','mempelai','momen','acara','rsvp','pesan','penutup'].map(id=>document.getElementById(id));
 const sessionId=crypto.randomUUID(),since=new Map();let maxDepth=0,mask=0,lastSection=0,sequence=0,ackSequence=0,ack='',busy=false;
 const snapshot=()=>({slug:guest.slug||'',sessionId,maxDepth,sectionsMask:mask,lastSection});
 async function flush(final=false){
  if(!mask||busy&&!final)return;
  const state=snapshot(),signature=JSON.stringify(state);if(!final&&signature===ack)return;
  const currentSequence=++sequence;busy=true;
  try{
   const response=await fetch('/api/reading-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state,sequence:currentSequence}),keepalive:true});
   if(response.ok&&currentSequence>ackSequence){ack=signature;ackSequence=currentSequence;}
  }catch{ /* The next scheduled send retries the current progress without creating another visit. */ }
  finally{busy=false;}
 }
 function sample(){
  if(document.hidden||!document.querySelector('#music-gate').hidden||document.querySelector('dialog[open]')){since.clear();return;}
  const now=performance.now(),reading=window.weddingReadingSample({boxes:sections.map(el=>el.getBoundingClientRect()),viewportHeight:innerHeight,pageHeight:document.documentElement.scrollHeight,scrollTop:scrollY});
  for(let index=0;index<sections.length;index++)if(!reading.visible.includes(index))since.delete(index);
  for(const index of reading.visible)if(!since.has(index))since.set(index,now);
  const qualified=reading.visible.filter(index=>now-since.get(index)>=750);if(!qualified.length)return;
  const wasEmpty=!mask;qualified.forEach(index=>mask|=1<<index);lastSection=qualified[0];maxDepth=Math.max(maxDepth,reading.depth);
  if(wasEmpty)flush();
 }
 setInterval(sample,500);setInterval(()=>flush(),5000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){flush(true);since.clear();}else sample();});
 window.addEventListener('pagehide',()=>flush(true));
 sample();
})();
