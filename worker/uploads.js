const MIME={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif','application/pdf':'pdf'};
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
async function key(env){if(!env.ADMIN_SESSION_SECRET)throw new Error('Upload signing is not configured');return crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signUpload(value,env){const payload=encode(new TextEncoder().encode(JSON.stringify(value)));return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),new TextEncoder().encode('upload:'+payload))));}
async function verify(ticket,env){
 if(typeof ticket!=='string'||ticket.length>2000)throw new Error('Invalid upload ticket');const parts=ticket.split('.');
 if(parts.length!==2||!await crypto.subtle.verify('HMAC',await key(env),decode(parts[1]),new TextEncoder().encode('upload:'+parts[0])))throw new Error('Invalid upload ticket');
 const value=JSON.parse(new TextDecoder().decode(decode(parts[0])));if(!Number.isFinite(value.expires)||value.expires<Date.now())throw new Error('Expired upload ticket');return value;
}
async function bytesOf(object,limit,fail){
 const reader=object.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)fail(413,'Ukuran berkas melebihi batas.');chunks.push(value);}}
 finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function verifiedProofKey(ticket,invitationId,env,fail){
 try{const p=await verify(ticket,env);if(p.kind!=='verified-proof'||p.subject!==invitationId||!/^gift-proofs\/[a-f0-9-]{36}\.(pdf|jpg|png|webp|avif)$/.test(p.key))throw new Error('Invalid proof');return p.key;}
 catch{fail(403,'Bukti transfer tidak valid atau kedaluwarsa. Unggah kembali.');}
}
export async function uploadRoute(request,env,path,h){
 if(!['/api/uploads','/api/uploads/complete'].includes(path))return null;
 const {body,requireAdmin,guestInvitation,isAdmin,first,fail,json,imageFormat,proofFormat}=h;
 if(request.method!=='POST')fail(405,'Metode tidak didukung.');
 const input=await body(request);
 async function subject(kind,slug){if(kind==='photo')return (await requireAdmin(request,env)).email;if(kind!=='proof')fail(400,'Jenis unggahan tidak valid.');if(await isAdmin(request,env))fail(403,'Unggah bukti melalui undangan tamu.');const inv=await guestInvitation(request,env,slug),count=await first(env,'SELECT COUNT(*) AS count FROM gifts WHERE invitation_id=?',inv.id);if(count.count>=10)fail(429,'Batas konfirmasi hadiah tercapai.');return inv.id;}
 if(path==='/api/uploads'){
  const owner=await subject(input.kind,input.slug),max=input.kind==='photo'?8000000:5000000,ext=MIME[input.mime];
  if(!ext||input.kind==='photo'&&ext==='pdf'||!Number.isInteger(input.size)||input.size<100||input.size>max)fail(400,'Jenis atau ukuran berkas tidak sesuai.');
  if(!env.BUCKET?.createSignedUpload)fail(503,'Unggahan langsung belum dikonfigurasi.');
  const uuid=crypto.randomUUID(),stage=`staging/${input.kind==='photo'?'photos':'proofs'}/${uuid}.${ext}`;
  const value={kind:input.kind,subject:owner,slug:input.slug||'',id:uuid,key:stage,mime:input.mime,size:input.size,expires:Date.now()+15*60*1000};
  const url=await env.BUCKET.createSignedUpload(stage,input.mime,input.size);
  return json({url,method:'PUT',ticket:await signUpload(value,env)},201);
 }
 let p;try{p=await verify(input.ticket,env);}catch{fail(403,'Unggahan tidak valid atau kedaluwarsa.');}
 if(await subject(p.kind,p.slug)!==p.subject)fail(403,'Unggahan ini milik pengunjung lain.');
 if(!/^staging\/(photos|proofs)\/[a-f0-9-]{36}\.(jpg|png|webp|avif|pdf)$/.test(p.key))fail(400,'Berkas tidak valid.');
 const final=(p.kind==='photo'?'':'gift-proofs/')+p.id+'.'+MIME[p.mime];
 let object=await env.BUCKET.get(p.key),alreadyFinal=false;
 if(!object){object=await env.BUCKET.get(final);alreadyFinal=Boolean(object);}if(!object)fail(404,'Berkas unggahan tidak ditemukan.');
 const bytes=await bytesOf(object,p.kind==='photo'?8000000:5000000,fail);
 let format;try{if(bytes.length!==p.size)fail(400,'Ukuran berkas berubah.');format=(p.kind==='photo'?imageFormat:proofFormat)(bytes);if(format[1]!==p.mime)fail(415,'Isi berkas tidak cocok dengan jenisnya.');}
 catch(error){await env.BUCKET.delete(p.key).catch(()=>{});throw error;}
 if(!alreadyFinal)await env.BUCKET.put(final,bytes,{httpMetadata:{contentType:format[1]}});await env.BUCKET.delete(p.key);
 return p.kind==='photo'?json({src:'/media/'+final,size:bytes.length,contentType:format[1]},201):json({proofTicket:await signUpload({kind:'verified-proof',subject:p.subject,key:final,expires:Date.now()+15*60*1000},env)},201);
}
