// File bytes go directly to a single, private staging object, never through Vercel's body limit.
window.uploadWeddingFile=async function(file,{kind='photo',slug=''}={}){
 if(kind==='photo'&&['127.0.0.1','localhost'].includes(location.hostname)){
  const body=new FormData();body.append('file',file);const r=await fetch('/api/admin/media',{method:'POST',body}),value=await r.json();if(!r.ok)throw new Error(value.error||'Unggah gagal.');return value;
 }
 const post=async(path,data)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await r.json();if(!r.ok)throw new Error(value.error||'Unggah gagal.');return value;};
 const mime=file.type||({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',pdf:'application/pdf'})[file.name.split('.').pop().toLowerCase()];
 const start=await post('/api/uploads',{kind,slug,mime,size:file.size});
 const url=new URL(start.url);if(url.origin!=='https://lgwrwymrjcptoztjvbxz.supabase.co'||url.username||url.password||!/^\/storage\/v1\/object\/upload\/sign\/wedding-(?:qa-)?staging\/staging\/(?:photos|proofs)\/[a-f0-9-]{36}\.(?:jpg|png|webp|avif|pdf)$/.test(url.pathname)||!url.searchParams.get('token'))throw new Error('Tujuan unggahan tidak valid.');
 const upload=await fetch(url,{method:'PUT',headers:{'Content-Type':mime},body:file,credentials:'omit',redirect:'error'});
 if(!upload.ok)throw new Error('Unggah belum selesai. Silakan coba lagi.');
 return post('/api/uploads/complete',{ticket:start.ticket});
};
