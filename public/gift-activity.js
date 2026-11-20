window.trackWeddingGiftActivity=async(action,source)=>{
 try{
  const guest=await window.weddingGuestReady;
  if(!guest?.authorized||guest.preview)return;
  const payload={action,source,slug:guest.slug||'',requestId:crypto.randomUUID()};
  for(let attempt=0;attempt<2;attempt++){
   try{
    const response=await fetch('/api/gift-activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true});
    if(response.ok)return;
    if(response.status<500)return;
   }catch{ /* Retry with the same ID so a lost response never doubles the record. */ }
  }
 }catch{ /* Activity recording must not interrupt copying or viewing bank details. */ }
};
