import {journeyRoute} from './journey.js';
import {analyzeGuestMessage} from './message-language.js';
import {uploadRoute,verifiedProofKey} from './uploads.js';
export const DEFAULT_EVENTS=[
 {id:'ceremony',title:'Acara 1',titleEn:'Event 1',date:'2026-12-12',time:'[waktu]',start:null,end:null,venue:'[tempat]',address:'',mapsUrl:null},
 {id:'reception',title:'Acara 2',titleEn:'Event 2',date:'2026-12-12',time:'[waktu]',start:null,end:null,venue:'[tempat]',address:'',mapsUrl:null},
 {id:'celebration',title:'Acara 3',titleEn:'Event 3',date:'2026-12-19',time:'[waktu]',start:null,end:null,venue:'[tempat]',address:'',mapsUrl:null}
];
export const READING_SECTIONS=[{"id":"home","label":"Pembuka"},{"id":"undangan","label":"01 \u00b7 Undangan"},{"id":"mempelai","label":"02 \u00b7 Mempelai"},{"id":"momen","label":"03 \u00b7 Momen kami"},{"id":"acara","label":"04 \u00b7 Detail acara"},{"id":"rsvp","label":"05 \u00b7 Konfirmasi kehadiran"},{"id":"pesan","label":"06 \u00b7 Buku pesan"},{"id":"penutup","label":"Penutup"}];
const CONTENT_KEYS=['heroScript','heroSubtitle','invitationHeading','invitationHeadingAccent','invitationIntro','memoHeading','memoHeadingAccent','memoBody','coupleHeading','coupleHeadingAccent','coupleBody1','coupleBody2','quoteHeading','quoteAccent','galleryIntro','eventsIntro','rsvpIntro','giftIntro','closingHeading','closingHeadingAccent','closingBody'];
export const RECEPTION_TABLES={Galilea:5,Jordan:10,Pishon:10};
export const TABLE_CAPACITY=10;
const EVENT_IDS=DEFAULT_EVENTS.map(e=>e.id),RESERVED=new Set(['admin','api','assets','media','signin-with-chatgpt','signout-with-chatgpt','callback','favicon','index','robots','health']);
const PUBLIC_ORIGINS=new Set(['https://stefen-jessica-forever.site','https://www.stefen-jessica-forever.site','https://helpyoumarried.foreverinlove.site','https://helpyoumarried.vercel.app']);
const stamp=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const token=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');};
class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
function fail(status,message){throw new AppError(status,message);}
function supabaseDatabase(env){
 if(!env.SUPABASE_URL||!env.WEDDING_DB_TOKEN)fail(503,'Sambungan Supabase belum lengkap.');
 const projectUrl=new URL(env.SUPABASE_URL);
 if(projectUrl.protocol!=='https:'||projectUrl.hostname!=='lgwrwymrjcptoztjvbxz.supabase.co')fail(503,'Alamat Supabase tidak valid.');
 const endpoint=new URL('/functions/v1/wedding-db',projectUrl).href;
 const send=async operations=>{
  let response;
  try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-wedding-db-token':env.WEDDING_DB_TOKEN},body:JSON.stringify({operations})});}
  catch(error){console.error('Supabase connection failed',error?.message);fail(503,'Database sedang tidak dapat dihubungi.');}
  if(response.status===409)fail(409,'Data RSVP, check-in, atau kapasitas meja berubah. Muat ulang halaman, periksa meja, lalu coba lagi.');
  if(!response.ok){console.error('Supabase operation failed',response.status);fail(503,'Database sedang tidak dapat menyimpan data.');}
  const value=await response.json();
  if(!Array.isArray(value.results)||value.results.length!==operations.length)fail(503,'Respons database tidak valid.');
  return value.results;
 };
 const prepared=(sql,args=[])=>({sql,args,
  bind(...values){return prepared(sql,values);},
  async first(){return (await send([{sql,args,mode:'first'}]))[0].rows[0]??null;},
  async all(){return {results:(await send([{sql,args,mode:'all'}]))[0].rows};},
  async run(){return (await send([{sql,args,mode:'run'}]))[0];}
 });
 return {prepare:sql=>prepared(sql),batch:async statements=>send(statements.map(statement=>({sql:statement.sql,args:statement.args,mode:'run'})))};
}
const db=env=>{if(env.SUPABASE_DB_ENABLED==='true')return supabaseDatabase(env);if(!env.DB)fail(503,'Database belum tersedia. Coba lagi sebentar.');return env.DB;};
const prep=(env,sql,...args)=>db(env).prepare(sql).bind(...args);
const first=(env,sql,...args)=>prep(env,sql,...args).first();
const all=async(env,sql,...args)=>(await prep(env,sql,...args).all()).results;
const run=(env,sql,...args)=>prep(env,sql,...args).run();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
function getUser(request){const uid=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return uid&&email?{id:uid,email}:null;}
function ownerEmail(email,env){return Boolean(email&&env.ADMIN_EMAIL&&email.toLowerCase()===env.ADMIN_EMAIL.trim().toLowerCase());}
const encode64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const decode64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
async function signingKey(env){if(!env.ADMIN_SESSION_SECRET)fail(503,'Sesi admin belum dikonfigurasi.');return crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function ownerCookie(user,env){const payload=encode64(new TextEncoder().encode(JSON.stringify({id:user.id,email:user.email,expires:Date.now()+14400000})));const signature=encode64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode(payload))));return `sj_admin=${payload}.${signature}; Path=/; Max-Age=14400; HttpOnly; Secure; SameSite=Lax`;}
async function getAdminCookie(request,env){
 const raw=cookie(request,'sj_admin'),parts=raw.split('.');if(parts.length!==2||!env.ADMIN_SESSION_SECRET)return null;
 try{const valid=await crypto.subtle.verify('HMAC',await signingKey(env),decode64(parts[1]),new TextEncoder().encode(parts[0]));if(!valid)return null;const session=JSON.parse(new TextDecoder().decode(decode64(parts[0])));if(typeof session.id!=='string'||!session.id||typeof session.expires!=='number'||session.expires<Date.now()||!ownerEmail(session.email,env))return null;return {id:session.id,email:session.email};}catch{return null;}
}
async function getAdmin(request,env){const user=getUser(request);if(user)return ownerEmail(user.email,env)?user:null;return getAdminCookie(request,env);}
async function isAdmin(request,env){return Boolean(await getAdmin(request,env));}
async function requireAdmin(request,env){const user=await getAdmin(request,env);if(user)return user;if(getUser(request))fail(403,'Akun ini tidak memiliki akses admin undangan.');fail(401,'Masuk menggunakan kode admin untuk mengakses Wedding Desk.');}
async function validAdminCode(value,env){if(typeof value!=='string'||value.length<6||value.length>128||!env.ADMIN_ACCESS_CODE)return false;const a=new TextEncoder().encode(value),b=new TextEncoder().encode(env.ADMIN_ACCESS_CODE);const [left,right]=await Promise.all([crypto.subtle.digest('SHA-256',a),crypto.subtle.digest('SHA-256',b)]);const x=new Uint8Array(left),y=new Uint8Array(right);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
async function adminLoginKey(request,env){const network=(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||request.headers.get('x-real-ip')||'unknown').trim().slice(0,128);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode(network)));return [...digest].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function checkAdminLogin(request,env,code){const key=await adminLoginKey(request,env),previous=await first(env,'SELECT failed_count,updated_at FROM admin_login_attempts WHERE id=?',key),recent=previous&&Date.now()-Date.parse(previous.updated_at)<15*60*1000;if(recent&&previous.failed_count>=5)fail(429,'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');if(await validAdminCode(code,env)){if(previous)await run(env,'DELETE FROM admin_login_attempts WHERE id=?',key);return;}await run(env,'INSERT INTO admin_login_attempts (id,failed_count,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET failed_count=excluded.failed_count,updated_at=excluded.updated_at',key,recent?previous.failed_count+1:1,stamp());fail(401,'Kode admin salah. Periksa kembali kode yang diberikan.');}
function cookie(request,name){const pairs=(request.headers.get('cookie')||'').split(';').map(s=>s.trim().split('='));return pairs.find(p=>p[0]===name)?.slice(1).join('=')||'';}
async function invitationBySlug(env,slug){return first(env,'SELECT * FROM invitations WHERE slug = ? AND active = 1',slug);}
function hasGuestAccess(request,inv){return cookie(request,'sj_guest_'+inv.slug)===inv.access_token||cookie(request,'sj_guest')===inv.access_token;}
async function guestInvitation(request,env,slug){const inv=await invitationBySlug(env,slug);if(!inv)fail(404,'Undangan tidak ditemukan atau sudah dinonaktifkan.');if(!await isAdmin(request,env)&&!hasGuestAccess(request,inv))fail(403,'Gunakan tautan lengkap yang dibagikan (nama pria) & (nama wanita) untuk membuka undangan personal ini.');return inv;}
function isWeddingOrigin(request){const origin=request.headers.get('origin');return (origin===new URL(request.url).origin||PUBLIC_ORIGINS.has(origin))&&request.headers.get('sec-fetch-site')!=='cross-site';}
function visitorLocale(request){const country=request.cf?.country||request.headers.get('cf-ipcountry');const language=country==='ID'?'id':/^[A-Z]{2}$/.test(country||'')?'en':'id';const origin=request.headers.get('origin'),headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'private,no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};if(PUBLIC_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;return new Response(JSON.stringify({language}),{headers});}
async function body(request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json')fail(415,'Kirim data dalam format JSON.');if(!isWeddingOrigin(request))fail(403,'Permintaan harus berasal dari situs undangan ini.');if(Number(request.headers.get('content-length')||0)>40000)fail(413,'Data terlalu panjang.');const raw=await request.text();if(raw.length>40000)fail(413,'Data terlalu panjang.');let data;try{data=JSON.parse(raw);}catch{fail(400,'Format data tidak valid.');}if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Data tidak valid.');return data;}
function text(value,max,required=false){if(typeof value!=='string'){if(required)fail(400,'Ada kolom wajib yang belum diisi.');return '';}const s=value.trim();if(s.length>max)fail(400,`Teks tidak boleh lebih dari ${max} karakter.`);if(required&&!s)fail(400,'Ada kolom wajib yang belum diisi.');return s;}
function integer(value,min,max){if(!Number.isInteger(value)||value<min||value>max)fail(400,`Jumlah harus antara ${min} dan ${max}.`);return value;}
function eventIds(value){if(!Array.isArray(value)||!value.length||value.length>3||new Set(value).size!==value.length||value.some(v=>!EVENT_IDS.includes(v)))fail(400,'Pilih acara yang valid.');return value;}
function publicInvite(inv,includeTable=false){return {id:inv.id,slug:inv.slug,guestName:inv.guest_name,salutation:inv.salutation||'',seats:inv.seats,eventIds:JSON.parse(inv.event_ids),...(includeTable?{receptionTable:inv.reception_table||''}:{})};}
function receptionTable(value,ids){const table=text(value,20);if(!ids.includes('reception'))return '';if(!table)return '';const match=table.match(/^(Galilea|Jordan|Pishon)-([1-9][0-9]?)$/);if(!match||Number(match[2])>RECEPTION_TABLES[match[1]])fail(400,'Pilih meja Resepsi 1 yang tersedia.');return table;}
async function reservedSeats(env,table,exceptId=''){if(!table)return 0;const rows=await all(env,"SELECT i.id,i.seats FROM invitations i WHERE i.reception_table = ? AND i.active = 1 AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.invitation_id=i.id AND r.event_id='reception' AND r.status='declined')",table);return rows.reduce((sum,row)=>sum+(row.id===exceptId?0:Number(row.seats)),0);}
async function checkTableCapacity(env,table,seats,exceptId=''){if(!table)return;const reserved=await reservedSeats(env,table,exceptId);if(reserved+seats>TABLE_CAPACITY)fail(409,`Meja ${table.replace('-', ' ')} hanya memiliki ${TABLE_CAPACITY} kursi. Tersisa ${Math.max(0,TABLE_CAPACITY-reserved)} kursi.`);}
function salutation(value){const raw=typeof value==='string'?value.trim().toLowerCase():value??'';const chosen=({'bapak-ibu':'bapak_ibu','bapak & ibu':'bapak_ibu','bapak dan ibu':'bapak_ibu','tuan-nyonya':'tuan_nyonya','tuan & nyonya':'tuan_nyonya','tuan dan nyonya':'tuan_nyonya'})[raw]??raw;if(!['','bapak','ibu','saudara','saudari','bapak_ibu','tuan_nyonya'].includes(chosen))fail(400,'Pilih sapaan yang tersedia.');return chosen;}
function invitationInput(data){const guestName=text(data.guestName,100,true),slug=text(data.slug,60,true).toLowerCase();if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||RESERVED.has(slug))fail(400,'Gunakan nama tautan seperti rudolf atau keluarga-rudolf.');const seats=integer(data.seats,1,20),ids=eventIds(data.eventIds);return {guestName,salutation:salutation(data.salutation),slug,seats,ids,table:receptionTable(data.receptionTable,ids),phone:text(data.phone,30),privateNote:text(data.privateNote,500)};}
function adminInvite(inv){return {...publicInvite(inv,true),phone:inv.phone,privateNote:inv.private_note,createdAt:inv.created_at,updatedAt:inv.updated_at,sharedAt:inv.shared_at,firstOpenedAt:inv.first_opened_at,lastOpenedAt:inv.last_opened_at,openCount:inv.open_count,heartCount:inv.heart_count||0,lastHeartAt:inv.last_heart_at,active:Boolean(inv.active)};}
async function getEvents(env){
 const row=await first(env,'SELECT value FROM settings WHERE key = ?','events');
 return (row?JSON.parse(row.value):DEFAULT_EVENTS).map(event=>{
  const defaults=DEFAULT_EVENTS.find(e=>e.id===event.id);
  // Upgrade legacy labels without changing the owner's dates, places or custom names.
  const legacy=!event.titleEn&&((event.id==='ceremony'&&event.title==='Holy Matrimony')||(event.id==='reception'&&event.title==='Resepsi 1')||(event.id==='celebration'&&event.title==='Resepsi 2'));
  return {...event,title:legacy?defaults.title:event.title,titleEn:event.titleEn||defaults?.titleEn||event.title};
 });
}
function validateEvents(events){if(!Array.isArray(events)||events.length!==3)fail(400,'Isi ketiga acara.');return EVENT_IDS.map(key=>{const e=events.find(e=>e.id===key);if(!e)fail(400,'Acara tidak lengkap.');const date=text(e.date,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail(400,'Tanggal tidak valid.');for(const field of ['start','end'])if(e[field]&&(!Number.isFinite(Date.parse(e[field]))||!/[+-]\d{2}:\d{2}$|Z$/.test(e[field])))fail(400,'Waktu harus memiliki zona waktu.');if(e.start&&e.end&&Date.parse(e.end)<=Date.parse(e.start))fail(400,'Jam selesai harus setelah jam mulai.');let mapsUrl=null;if(e.mapsUrl){let url;try{url=new URL(e.mapsUrl);}catch{fail(400,'Tautan Maps tidak valid.');}if(url.protocol!=='https:'||!(/(^|\.)google\.[a-z.]+$/.test(url.hostname)||['maps.app.goo.gl','goo.gl','share.google'].includes(url.hostname)))fail(400,'Gunakan tautan Google Maps HTTPS.');mapsUrl=url.href;}return {id:key,title:text(e.title,80,true),titleEn:text(e.titleEn??DEFAULT_EVENTS.find(d=>d.id===key).titleEn,80,true),date,start:e.start||null,end:e.end||null,venue:text(e.venue,150,true),address:text(e.address,250),mapsUrl};});}
async function getContent(env){const row=await first(env,'SELECT value FROM settings WHERE key = ?','content');return row?JSON.parse(row.value):null;}
function validateContent(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!value.texts||typeof value.texts!=='object'||Array.isArray(value.texts)||!Array.isArray(value.photos)||value.photos.length<5||value.photos.length>50||!value.featured)fail(400,'Isi teks dan pilih 5 sampai 50 foto.');
 const entries=Object.entries(value.texts);if(entries.length>160)fail(400,'Terlalu banyak kolom tulisan.');
 const texts={};for(const [key,copy] of entries){if(!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key))fail(400,'Nama kolom tulisan tidak valid.');texts[key]=text(copy,600,true);}
 for(const key of CONTENT_KEYS)if(!Object.hasOwn(texts,key))fail(400,'Ada tulisan undangan yang belum diisi.');
 let textsEn=null;if(value.textsEn!==undefined){if(!value.textsEn||typeof value.textsEn!=='object'||Array.isArray(value.textsEn)||Object.keys(value.textsEn).length>160)fail(400,'Tulisan bahasa Inggris tidak valid.');textsEn={};for(const [key,copy] of Object.entries(value.textsEn)){if(!Object.hasOwn(texts,key))fail(400,'Kolom bahasa Inggris tidak cocok.');textsEn[key]=text(copy,600,true);}for(const key of CONTENT_KEYS)if(!Object.hasOwn(textsEn,key))fail(400,'Ada tulisan bahasa Inggris yang belum diisi.');}
 const photos=value.photos.map((p,index)=>{if(p?.id!==index+1)fail(400,'Urutan slot foto tidak valid.');const src=text(p.src,110,true);if(!/^\/assets\/photo-(?:0[1-9]|[1-4][0-9]|50)-new\.webp$/.test(src)&&!/^\/assets\/photo-(?:0[1-9]|1[0-5])\.webp$/.test(src)&&!/^\/media\/[a-f0-9-]{36}\.(webp|jpg|png|avif)$/.test(src))fail(400,'Pilih foto yang diunggah melalui admin.');if(!['office','garden','casual'].includes(p.category))fail(400,'Kategori foto tidak valid.');return {id:index+1,src,caption:text(p.caption,120,true),captionEn:text(p.captionEn||p.caption,120,true),alt:text(p.alt,200,true),altEn:text(p.altEn||p.alt,200,true),category:p.category};});
 const featured=value.featured,hero=featured.hero;if(!Array.isArray(hero)||hero.length!==3||new Set(hero).size!==3||hero.some(n=>!Number.isInteger(n)||n<1||n>photos.length)||![featured.couple,featured.closing].every(n=>Number.isInteger(n)&&n>=1&&n<=photos.length))fail(400,'Pilih foto unggulan yang valid.');
 return {texts,...(textsEn?{textsEn}:{}),photos,featured:{hero,couple:featured.couple,closing:featured.closing}};
}
function imageFormat(bytes){if(bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return ['webp','image/webp'];if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return ['png','image/png'];if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['jpg','image/jpeg'];if(bytes.length>=12&&bytes[4]===102&&bytes[5]===116&&bytes[6]===121&&bytes[7]===112&&bytes[8]===97&&bytes[9]===118&&bytes[10]===105&&(bytes[11]===102||bytes[11]===115))return ['avif','image/avif'];fail(415,'Unggah foto JPG, PNG, WebP, atau AVIF.');}
async function uploadMedia(request,env){
 if(!isWeddingOrigin(request))fail(403,'Unggah foto dari halaman admin undangan.');
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))fail(415,'Pilih berkas foto.');
 if(Number(request.headers.get('content-length')||0)>8500000)fail(413,'Foto maksimal 8 MB.');
 if(!env.BUCKET)fail(503,'Penyimpanan foto belum tersedia.');
 const form=await request.formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size<100||file.size>8000000)fail(413,'Pilih foto berukuran 100 byte sampai 8 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),[ext,mime]=imageFormat(bytes),key=`${id()}.${ext}`;
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
 return json({src:'/media/'+key,size:file.size,contentType:mime},201);
}
async function media(request,env,path){if(!env.BUCKET)fail(503,'Penyimpanan foto belum tersedia.');const key=path.slice(7);if(!/^[a-f0-9-]{36}\.(webp|jpg|png|avif)$/.test(key))fail(404,'Foto tidak ditemukan.');const object=await env.BUCKET.get(key);if(!object)fail(404,'Foto tidak ditemukan.');const mime={webp:'image/webp',jpg:'image/jpeg',png:'image/png',avif:'image/avif'}[key.split('.').pop()];return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':mime,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}});}
function proofFormat(bytes){if(bytes.length>=5&&[37,80,68,70,45].every((v,i)=>bytes[i]===v))return ['pdf','application/pdf'];try{return imageFormat(bytes);}catch(error){if(error instanceof AppError&&error.status===415)fail(415,'Bukti transfer harus berupa JPG, PNG, WebP, AVIF, atau PDF.');throw error;}}
async function giftSubmission(request){
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))return {data:await body(request),proof:null};
 if(!isWeddingOrigin(request))fail(403,'Kirim konfirmasi dari halaman undangan.');
 if(Number(request.headers.get('content-length')||0)>6000000)fail(413,'Bukti transfer maksimal 5 MB.');
 const form=await request.formData(),file=form.get('proof');
 const amount=form.get('amount'),data={requestId:form.get('requestId'),kind:form.get('kind'),amount:amount===null||amount===''?null:Number(amount),note:form.get('note')};
 if(file!==null){if(typeof file.arrayBuffer!=='function')fail(400,'Berkas bukti transfer tidak valid.');if(file.size>5000000||file.size<100)fail(413,'Bukti transfer harus berukuran 100 byte sampai 5 MB.');if(data.kind!=='transfer')fail(400,'Bukti transfer hanya untuk hadiah transfer.');return {data,proof:file};}
 return {data,proof:null};
}
function giftInput(data){if(!['transfer','cash','goods','other'].includes(data.kind))fail(400,'Jenis hadiah tidak valid.');return {kind:data.kind,amount:data.amount===null||data.amount===undefined||data.amount===''?null:integer(data.amount,0,1000000000),note:text(data.note,500)};}
async function visitorHash(request,env,create=false){
 let value=cookie(request,'sj_visitor');let setCookie='';
 if(!/^[a-zA-Z0-9_-]{43}$/.test(value)){if(!create)fail(403,'Muat ulang undangan sebelum mengirim.');value=token();setCookie=`sj_visitor=${value}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
 const bytes=await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode('visitor:'+value));
 return {hash:encode64(new Uint8Array(bytes)),setCookie};
}
async function messageIdentity(request,env,slug){
 if(!slug)return null;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Tautan undangan tidak valid.');
 const invitation=await invitationBySlug(env,slug);if(!invitation)fail(404,'Undangan tidak ditemukan.');
 if(!hasGuestAccess(request,invitation)&&!await isAdmin(request,env))fail(403,'Buka tautan personal lengkap untuk mengirim atas nama tamu ini.');
 return invitation;
}
function messageView(row){return {id:row.id,name:row.guest_name,original:row.original,language:row.language,translationId:row.translation_id,translationEn:row.translation_en,createdAt:row.created_at};}
async function processGuestMessage(env,row){
 const result=await analyzeGuestMessage(row.original,env,row.guest_name);
 const status=row.reason==='admin'?row.status:result.status,reason=row.reason==='admin'?'admin':result.reason;
 await run(env,'UPDATE guest_messages SET language=?,translation_id=?,translation_en=?,status=?,reason=?,updated_at=? WHERE id=? AND updated_at=?',result.language,result.translationId,result.translationEn,status,reason,stamp(),row.id,row.updated_at);
 return first(env,'SELECT * FROM guest_messages WHERE id=?',row.id);
}
async function guestbookRoute(request,env,path,url){
 const method=request.method;
 if(path==='/api/visitor'&&method==='GET'){
  const visitor=await visitorHash(request,env,true),slug=url.searchParams.get('slug')||'';
  const invite=slug?await invitationBySlug(env,slug):null;
  const preview=await isAdmin(request,env),authorized=invite&&(preview||hasGuestAccess(request,invite));
  const rsvp=await first(env,'SELECT guest_name,responses,updated_at FROM general_rsvps WHERE owner_hash=?',visitor.hash);
  const response=json({name:authorized?invite.guest_name:'',invitation:authorized?publicInvite(invite):null,preview,rsvp:rsvp?{name:rsvp.guest_name,responses:JSON.parse(rsvp.responses),updatedAt:rsvp.updated_at}:null});
  if(visitor.setCookie)response.headers.set('Set-Cookie',visitor.setCookie);return response;
 }
 if(path==='/api/messages'&&method==='GET'){
  const visitor=await visitorHash(request,env,true),page=integer(Number(url.searchParams.get('page')||1),1,100000);
  const rows=await all(env,"SELECT id,guest_name,original,language,translation_id,translation_en,created_at FROM guest_messages WHERE status='published' OR owner_hash=? ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?",visitor.hash,(page-1)*20);
  const response=json({messages:rows.slice(0,20).map(messageView),page,hasMore:rows.length>20});if(visitor.setCookie)response.headers.set('Set-Cookie',visitor.setCookie);return response;
 }
 if(path==='/api/messages'&&method==='POST'){
  const data=await body(request);if(await isAdmin(request,env))fail(403,'Pratinjau admin tidak mengirim pesan sebagai tamu.');
  const {hash}=await visitorHash(request,env),requestId=text(data.requestId,64,true);if(!/^[a-zA-Z0-9-]{8,64}$/.test(requestId))fail(400,'ID pesan tidak valid.');
  const existing=await first(env,'SELECT * FROM guest_messages WHERE owner_hash=? AND request_id=?',hash,requestId);if(existing)return json({saved:true,message:messageView(existing)},201);
  const inv=await messageIdentity(request,env,text(data.slug,60)),name=inv?inv.guest_name:text(data.name,100,true),original=text(data.message,1000,true),network=await adminLoginKey(request,env);
  const recent=await first(env,'SELECT COUNT(*) AS count FROM guest_messages WHERE (owner_hash=? OR network_hash=?) AND created_at>?',hash,network,new Date(Date.now()-3600000).toISOString());
  if(Number(recent.count)>=10)fail(429,'Sudah ada beberapa pesan terkirim. Coba lagi satu jam lagi.');
  const now=stamp(),messageId=id();
  await run(env,"INSERT INTO guest_messages (id,owner_hash,network_hash,request_id,invitation_id,guest_name,original,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?) ON CONFLICT(owner_hash,request_id) DO NOTHING",messageId,hash,network,requestId,inv?.id||null,name,original,now,now);
  const saved=await first(env,'SELECT * FROM guest_messages WHERE owner_hash=? AND request_id=?',hash,requestId);
  const processed=saved.id===messageId?await processGuestMessage(env,saved):saved;
  return json({saved:true,message:messageView(processed)},201);
 }
 if(path==='/api/rsvp'&&method==='POST'){
  const data=await body(request);if(await isAdmin(request,env))fail(403,'Pratinjau admin tidak mencatat RSVP tamu.');
  const {hash}=await visitorHash(request,env),name=text(data.name,100,true);
  if(!Array.isArray(data.responses)||data.responses.length!==1||data.responses[0]?.eventId!=='celebration')fail(400,'Undangan umum hanya menerima konfirmasi untuk Resepsi II.');
  const responses=data.responses.map(r=>{if(r.eventId!=='celebration'||!['attending','declined'].includes(r.status))fail(400,'Jawaban tidak valid.');return {event_id:r.eventId,status:r.status,guest_count:r.status==='attending'?integer(r.guestCount,1,20):0};});
  await run(env,'INSERT INTO general_rsvps (owner_hash,guest_name,responses,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET guest_name=excluded.guest_name,responses=excluded.responses,updated_at=excluded.updated_at',hash,name,JSON.stringify(responses),stamp());
  return json({saved:true,responses});
 }
 return null;
}
function secure(response,request){
 const r=new Response(response.body,response),url=new URL(request.url);
 r.headers.set('Referrer-Policy','no-referrer');r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://lgwrwymrjcptoztjvbxz.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
 // Apply after ASSETS too: its public cache headers must not override guest/admin privacy.
 const dynamic=/^\/(?:api(?:\/|$)|admin(?:[/.]|$)|[a-z0-9]+(?:-[a-z0-9]+)*\/?$)/.test(url.pathname);
 if(dynamic||url.searchParams.has('key')||r.headers.has('set-cookie')||r.status>=300){
  r.headers.set('Cache-Control','private, no-store');r.headers.set('CDN-Cache-Control','no-store');r.headers.set('Vercel-CDN-Cache-Control','no-store');
 }
 return r;
}
async function asset(request,env,path){const url=new URL(request.url);url.pathname=path;url.search='';return env.ASSETS.fetch(new Request(url,{method:request.method==='HEAD'?'HEAD':'GET'}));}
export default {async fetch(request,env,ctx){try{return secure(await route(request,env,ctx),request);}catch(error){if(!(error instanceof AppError))console.error('Wedding request failed',error?.message);return secure(json({error:error instanceof AppError?error.message:'Layanan sedang mengalami kendala. Data belum disimpan; silakan coba lagi.'},error instanceof AppError?error.status:503),request);}}};
async function route(request,env,ctx){const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/',method=request.method;
 // Never produce a protocol-relative Location from an ambiguous incoming path.
 if(/^\/(?:\/|%2f|%5c)/i.test(url.pathname))fail(400,'Tautan tidak valid.');
 // Keep the browser on its original host through the Vercel rewrite. Preserve the token query.
 if(url.pathname!=='/'&&url.pathname.endsWith('/')&&['GET','HEAD'].includes(method))return new Response(null,{status:308,headers:{Location:path+url.search}});
 if(path==='/wedding-desk-shell.html')fail(404,'Halaman tidak ditemukan.');
 const upload=await uploadRoute(request,env,path,{body,requireAdmin,guestInvitation,isAdmin,first,fail,json,imageFormat,proofFormat});if(upload)return upload;
 if(path==='/api/locale'&&method==='GET')return visitorLocale(request);
 if(path==='/api/reading-progress'&&method==='POST'){
  const data=await body(request);if(await isAdmin(request,env))return json({recorded:false,preview:true});
  const sessionId=text(data.sessionId,64,true);if(!/^[a-zA-Z0-9-]{8,64}$/.test(sessionId))fail(400,'ID kunjungan tidak valid.');
  const depth=integer(data.maxDepth,0,100),mask=integer(data.sectionsMask,1,255),last=integer(data.lastSection,0,7),sequence=integer(data.sequence,1,1000000);
  if(!(mask & (1<<last)))fail(400,'Section terakhir tidak sesuai.');
  const deepest=Math.floor(Math.log2(mask)),inv=await messageIdentity(request,env,data.slug||'');
  const hash=inv?encode64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode('reading:'+inv.access_token)))):(await visitorHash(request,env)).hash;
  const old=await first(env,'SELECT id FROM reading_progress WHERE visitor_hash=? AND session_id=?',hash,sessionId);
  if(!old){const count=await first(env,'SELECT COUNT(*) AS count FROM reading_progress WHERE visitor_hash=? AND created_at>=?',hash,new Date(Date.now()-86400000).toISOString());if(Number(count.count)>=100)fail(429,'Batas kunjungan tercapai.');}
  const now=stamp();await run(env,"INSERT INTO reading_progress (id,invitation_id,visitor_hash,session_id,max_depth,sections_mask,deepest_section,last_section,sequence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(visitor_hash,session_id) DO UPDATE SET max_depth=CASE WHEN excluded.max_depth>reading_progress.max_depth THEN excluded.max_depth ELSE reading_progress.max_depth END,sections_mask=reading_progress.sections_mask | excluded.sections_mask,deepest_section=CASE WHEN excluded.deepest_section>reading_progress.deepest_section THEN excluded.deepest_section ELSE reading_progress.deepest_section END,last_section=CASE WHEN excluded.sequence>reading_progress.sequence THEN excluded.last_section ELSE reading_progress.last_section END,updated_at=CASE WHEN excluded.sequence>reading_progress.sequence THEN excluded.updated_at ELSE reading_progress.updated_at END,sequence=CASE WHEN excluded.sequence>reading_progress.sequence THEN excluded.sequence ELSE reading_progress.sequence END",id(),inv?.id||null,hash,sessionId,depth,mask,deepest,last,sequence,now,now);
  return json({recorded:true});
 }
 if(path==='/api/gift-activity'&&method==='POST'){
  const data=await body(request);if(await isAdmin(request,env))return json({recorded:false,preview:true});
  if(!['opened','copy_clicked','account_copied'].includes(data.action)||!['floating','rsvp'].includes(data.source))fail(400,'Aktivitas hadiah tidak valid.');
  const requestId=text(data.requestId,64,true);if(!/^[a-zA-Z0-9-]{8,64}$/.test(requestId))fail(400,'ID aktivitas tidak valid.');
  const inv=await messageIdentity(request,env,data.slug||'');
  const visitor=inv?{hash:encode64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode('gift:'+inv.access_token)))),setCookie:''}:await visitorHash(request,env);
  const old=await first(env,'SELECT id FROM gift_activity WHERE visitor_hash=? AND request_id=?',visitor.hash,requestId);
  if(!old){const total=await first(env,'SELECT COUNT(*) AS count FROM gift_activity WHERE visitor_hash=?',visitor.hash);if(total.count>=2000)fail(429,'Batas aktivitas tercapai.');
   await run(env,'INSERT INTO gift_activity (id,invitation_id,visitor_hash,request_id,action,source,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(visitor_hash,request_id) DO NOTHING',id(),inv?.id||null,visitor.hash,requestId,data.action,data.source,stamp());}
  return json({recorded:true});
 }
 if(path==='/api/events'&&method==='GET')return json({events:await getEvents(env)});
 if(path==='/api/content'&&method==='GET')return json({content:await getContent(env)});
 if(['/api/visitor','/api/messages','/api/rsvp'].includes(path)){const result=await guestbookRoute(request,env,path,url);if(result)return result;fail(405,'Metode tidak didukung.');}
 if(path==='/api/admin/login'&&method==='POST'){const data=await body(request);await checkAdminLogin(request,env,data.code);const user={id:'admin-access-code',email:env.ADMIN_EMAIL};return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'private,no-store','Set-Cookie':await ownerCookie(user,env)}});}
 if(path.startsWith('/media/')){if(!['GET','HEAD'].includes(method))fail(405,'Metode tidak didukung.');return media(request,env,path);}
 if(path.startsWith('/api/admin/')){
  const admin=await requireAdmin(request,env);
  const journey=await journeyRoute(request,env,path,admin,{all,first,prep,db,body,json,fail,text,integer,id,stamp,getEvents,receptionTable,checkTableCapacity});if(journey)return journey;
  if(path==='/api/admin/session'&&method==='GET')return json({email:admin.email});
  if(path==='/api/admin/reading-progress'&&method==='GET'){
   const page=integer(Number(url.searchParams.get('page')||1),1,100000);
   const [summary,rows]=await Promise.all([first(env,"SELECT COUNT(*) AS readers,COALESCE(SUM(visits),0) AS visits,COALESCE(AVG(max_depth),0) AS average_depth,COALESCE(SUM(CASE WHEN max_depth>=95 THEN 1 ELSE 0 END),0) AS finished,COALESCE(SUM(reach_0),0) AS reach_0,COALESCE(SUM(CASE WHEN deepest_section=0 THEN 1 ELSE 0 END),0) AS stop_0,COALESCE(SUM(reach_1),0) AS reach_1,COALESCE(SUM(CASE WHEN deepest_section=1 THEN 1 ELSE 0 END),0) AS stop_1,COALESCE(SUM(reach_2),0) AS reach_2,COALESCE(SUM(CASE WHEN deepest_section=2 THEN 1 ELSE 0 END),0) AS stop_2,COALESCE(SUM(reach_3),0) AS reach_3,COALESCE(SUM(CASE WHEN deepest_section=3 THEN 1 ELSE 0 END),0) AS stop_3,COALESCE(SUM(reach_4),0) AS reach_4,COALESCE(SUM(CASE WHEN deepest_section=4 THEN 1 ELSE 0 END),0) AS stop_4,COALESCE(SUM(reach_5),0) AS reach_5,COALESCE(SUM(CASE WHEN deepest_section=5 THEN 1 ELSE 0 END),0) AS stop_5,COALESCE(SUM(reach_6),0) AS reach_6,COALESCE(SUM(CASE WHEN deepest_section=6 THEN 1 ELSE 0 END),0) AS stop_6,COALESCE(SUM(reach_7),0) AS reach_7,COALESCE(SUM(CASE WHEN deepest_section=7 THEN 1 ELSE 0 END),0) AS stop_7 FROM (SELECT invitation_id,visitor_hash,COUNT(*) AS visits,MAX(max_depth) AS max_depth,MAX(deepest_section) AS deepest_section,MAX(CASE WHEN (sections_mask & 1)>0 THEN 1 ELSE 0 END) AS reach_0,MAX(CASE WHEN (sections_mask & 2)>0 THEN 1 ELSE 0 END) AS reach_1,MAX(CASE WHEN (sections_mask & 4)>0 THEN 1 ELSE 0 END) AS reach_2,MAX(CASE WHEN (sections_mask & 8)>0 THEN 1 ELSE 0 END) AS reach_3,MAX(CASE WHEN (sections_mask & 16)>0 THEN 1 ELSE 0 END) AS reach_4,MAX(CASE WHEN (sections_mask & 32)>0 THEN 1 ELSE 0 END) AS reach_5,MAX(CASE WHEN (sections_mask & 64)>0 THEN 1 ELSE 0 END) AS reach_6,MAX(CASE WHEN (sections_mask & 128)>0 THEN 1 ELSE 0 END) AS reach_7 FROM reading_progress GROUP BY invitation_id,visitor_hash) AS readers"),all(env,"SELECT p.invitation_id,p.visitor_hash,MAX(i.guest_name) AS invitation_name,MAX(i.salutation) AS salutation,MAX(i.slug) AS slug,MAX(r.guest_name) AS general_name,COUNT(*) AS visits,MAX(p.max_depth) AS max_depth,MAX(p.deepest_section) AS deepest_section,MAX(p.updated_at) AS last_seen,(SELECT latest.last_section FROM reading_progress latest WHERE latest.visitor_hash=p.visitor_hash ORDER BY latest.updated_at DESC,latest.id DESC LIMIT 1) AS last_section FROM reading_progress p LEFT JOIN invitations i ON i.id=p.invitation_id LEFT JOIN general_rsvps r ON r.owner_hash=p.visitor_hash GROUP BY p.invitation_id,p.visitor_hash ORDER BY last_seen DESC,p.visitor_hash LIMIT 21 OFFSET ?",(page-1)*20)]);
   return json({summary,sections:READING_SECTIONS,readers:rows.slice(0,20).map(({visitor_hash,...row})=>({...row,visitorLabel:row.invitation_id?null:visitor_hash.slice(0,8)})),page,hasMore:rows.length>20});
  }
  if(path==='/api/admin/gift-activity'&&method==='GET'){
   const page=integer(Number(url.searchParams.get('page')||1),1,100000);
   const rows=await all(env,"SELECT a.invitation_id,a.visitor_hash,MAX(i.guest_name) AS invitation_name,MAX(i.salutation) AS salutation,MAX(i.slug) AS slug,MAX(r.guest_name) AS general_name,SUM(CASE WHEN a.action='opened' THEN 1 ELSE 0 END) AS opened,SUM(CASE WHEN a.action='copy_clicked' THEN 1 ELSE 0 END) AS copy_clicked,SUM(CASE WHEN a.action='account_copied' THEN 1 ELSE 0 END) AS account_copied,MAX(a.created_at) AS last_activity_at FROM gift_activity a LEFT JOIN invitations i ON i.id=a.invitation_id LEFT JOIN general_rsvps r ON r.owner_hash=a.visitor_hash GROUP BY a.invitation_id,a.visitor_hash ORDER BY last_activity_at DESC,a.visitor_hash LIMIT 21 OFFSET ?",(page-1)*20);
   return json({activity:rows.slice(0,20).map(({visitor_hash,...row})=>({...row,visitorLabel:row.invitation_id?null:visitor_hash.slice(0,8)})),page,hasMore:rows.length>20});
  }
  if(path==='/api/admin/messages'&&method==='GET'){
   const page=integer(Number(url.searchParams.get('page')||1),1,100000),status=url.searchParams.get('status')||'all';if(!['all','published','held','pending'].includes(status))fail(400,'Filter pesan tidak valid.');
   const messages=await all(env,'SELECT * FROM guest_messages WHERE (? = \'all\' OR status=?) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?',status,status,(page-1)*20);
   return json({messages:messages.slice(0,20).map(({owner_hash,network_hash,...row})=>row),page,hasMore:messages.length>20,translationConfigured:Boolean(env.OPENAI_API_KEY)});
  }
  const messageMatch=path.match(/^\/api\/admin\/messages\/([a-zA-Z0-9-]+)(?:\/(translate))?$/);
  if(messageMatch){const row=await first(env,'SELECT * FROM guest_messages WHERE id=?',messageMatch[1]);if(!row)fail(404,'Pesan tidak ditemukan.');
   if(messageMatch[2]==='translate'&&method==='POST'){await body(request);const result=await processGuestMessage(env,row);return json({saved:true,status:result.status,translated:Boolean(result.translation_id&&result.translation_en)});}
   if(!messageMatch[2]&&method==='PATCH'){const data=await body(request);if(!['published','held'].includes(data.status))fail(400,'Status pesan tidak valid.');await run(env,'UPDATE guest_messages SET status=?,reason=?,updated_at=? WHERE id=?',data.status,'admin',stamp(),row.id);return json({saved:true});}
  }
  if(path==='/api/admin/general-rsvps'&&method==='GET'){const page=integer(Number(url.searchParams.get('page')||1),1,100000);const rows=await all(env,'SELECT guest_name,responses,updated_at FROM general_rsvps ORDER BY updated_at DESC LIMIT 21 OFFSET ?',(page-1)*20);return json({rsvps:rows.slice(0,20).map(r=>({name:r.guest_name,responses:JSON.parse(r.responses),updatedAt:r.updated_at})),page,hasMore:rows.length>20});}
  if(path==='/api/admin/content'&&method==='GET')return json({content:await getContent(env)});
  if(path==='/api/admin/content'&&method==='PUT'){const value=validateContent((await body(request)).content);await run(env,'INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at','content',JSON.stringify(value),stamp());return json({content:value});}
  if(path==='/api/admin/media'&&method==='POST')return uploadMedia(request,env);
  if(path==='/api/admin/events'&&method==='PUT'){const data=await body(request),events=validateEvents(data.events);await run(env,'INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at','events',JSON.stringify(events),stamp());return json({events});}
  if(path==='/api/admin/invitations'&&method==='GET'){
   const [invitations,responses,gifts,events,giftActivity,readingProgress]=await Promise.all([all(env,'SELECT * FROM invitations ORDER BY created_at DESC'),all(env,'SELECT * FROM responses'),all(env,'SELECT * FROM gifts ORDER BY created_at DESC'),getEvents(env),all(env,"SELECT invitation_id,SUM(CASE WHEN action='opened' THEN 1 ELSE 0 END) AS opened,SUM(CASE WHEN action='copy_clicked' THEN 1 ELSE 0 END) AS copy_clicked,SUM(CASE WHEN action='account_copied' THEN 1 ELSE 0 END) AS account_copied,MAX(created_at) AS last_activity_at FROM gift_activity WHERE invitation_id IS NOT NULL GROUP BY invitation_id"),all(env,"SELECT invitation_id,COUNT(*) AS visits,MAX(max_depth) AS max_depth,MAX(deepest_section) AS deepest_section,MAX(updated_at) AS last_seen,(SELECT latest.last_section FROM reading_progress latest WHERE latest.invitation_id=p.invitation_id ORDER BY latest.updated_at DESC,latest.id DESC LIMIT 1) AS last_section FROM reading_progress p WHERE invitation_id IS NOT NULL GROUP BY invitation_id")]);
   return json({invitations:invitations.map(adminInvite),responses,gifts,events,giftActivity,readingProgress});
  }
  if(path==='/api/admin/invitations'&&method==='POST'){
   const input=invitationInput(await body(request)),{guestName,salutation,slug,seats,ids,table,phone,privateNote}=input;
   if(await first(env,'SELECT id FROM invitations WHERE slug = ?',slug))fail(409,'Tautan ini sudah digunakan. Pilih nama tautan lain.');
   await checkTableCapacity(env,table,seats);
   const now=stamp(),invId=id(),access=token();
   try{await run(env,'INSERT INTO invitations (id,slug,guest_name,salutation,phone,seats,event_ids,reception_table,access_token,private_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',invId,slug,guestName,salutation,phone,seats,JSON.stringify(ids),table,access,privateNote,now,now);}catch(e){if(/UNIQUE/.test(e.message))fail(409,'Tautan ini sudah digunakan.');throw e;}
   return json({invitation:adminInvite(await first(env,'SELECT * FROM invitations WHERE id = ?',invId)),sharePath:`/${slug}?key=${access}`},201);
  }
  if(path==='/api/admin/invitations/bulk'&&method==='POST'){
   const payload=await body(request);if(!Array.isArray(payload.invitations)||payload.invitations.length<1||payload.invitations.length>50)fail(400,'Unggah 1 sampai 50 undangan sekaligus.');
   const inputs=payload.invitations.map(invitationInput),slugs=inputs.map(i=>i.slug);
   if(new Set(slugs).size!==slugs.length)fail(409,'Ada nama tautan yang sama dalam berkas.');
   const existing=await all(env,'SELECT slug FROM invitations');const used=new Set(existing.map(i=>i.slug));if(slugs.some(slug=>used.has(slug)))fail(409,'Ada nama tautan yang sudah dipakai. Periksa berkas sebelum mengunggah.');
   const totals=new Map();for(const input of inputs)if(input.table)totals.set(input.table,(totals.get(input.table)||0)+input.seats);
   for(const [table,seats] of totals)await checkTableCapacity(env,table,seats);
   const now=stamp(),created=inputs.map(input=>({...input,id:id(),access:token()}));
   const sql='INSERT INTO invitations (id,slug,guest_name,salutation,phone,seats,event_ids,reception_table,access_token,private_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
   await db(env).batch(created.map(i=>prep(env,sql,i.id,i.slug,i.guestName,i.salutation,i.phone,i.seats,JSON.stringify(i.ids),i.table,i.access,i.privateNote,now,now)));
   return json({created:created.map(i=>({id:i.id,guestName:i.guestName,salutation:i.salutation,slug:i.slug,sharePath:`/${i.slug}?key=${i.access}`}))},201);
  }
  const inviteMatch=path.match(/^\/api\/admin\/invitations\/([a-zA-Z0-9-]+)(?:\/(link|shared|rsvp|rsvp-log))?$/);
  if(inviteMatch){const inv=await first(env,'SELECT * FROM invitations WHERE id = ?',inviteMatch[1]);if(!inv)fail(404,'Tamu tidak ditemukan.');
   if(inviteMatch[2]==='rsvp-log'&&method==='GET'){
    const rows=await all(env,"SELECT event_id,before_value,after_value,created_at,actor FROM journey_activity WHERE subject_key=? AND action='rsvp_admin' ORDER BY created_at DESC,id DESC LIMIT 30",'invitation:'+inv.id);
    return json({history:rows.map(row=>({eventId:row.event_id,before:JSON.parse(row.before_value),after:JSON.parse(row.after_value),at:row.created_at,actor:row.actor}))});
   }
   if(inviteMatch[2]==='rsvp'&&method==='PATCH'){
    const input=await body(request),event=text(input.eventId,30,true),status=text(input.status,20,true);
    if(!inv.active)fail(409,'Undangan ini sedang nonaktif.');
    if(!JSON.parse(inv.event_ids).includes(event))fail(400,'Acara ini tidak tersedia untuk undangan tersebut.');
    if(!['attending','declined','pending'].includes(status))fail(400,'Status RSVP tidak valid.');
    if(!Object.hasOwn(input,'expectedUpdatedAt')||(input.expectedUpdatedAt!==null&&typeof input.expectedUpdatedAt!=='string'))fail(400,'Versi jawaban RSVP tidak valid. Segarkan halaman.');
    const count=status==='attending'?integer(input.guestCount,1,inv.seats):0;
    const source=text(input.source,20,true),note=text(input.note,300);
    if(!['phone','whatsapp','direct','other'].includes(source))fail(400,'Pilih sumber konfirmasi yang valid.');
    const old=await first(env,'SELECT id,status,guest_count,message,updated_at FROM responses WHERE invitation_id=? AND event_id=?',inv.id,event);
    if((old?.updated_at||null)!==input.expectedUpdatedAt)fail(409,'RSVP telah diperbarui oleh tamu atau admin lain. Tutup formulir dan buka kembali untuk melihat jawaban terbaru.');
    if(status!=='attending'){
     const arrived=await first(env,'SELECT checked_in,seated FROM journey_attendance WHERE subject_key=? AND event_id=?','invitation:'+inv.id,event);
     if(arrived&&(arrived.checked_in>0||arrived.seated>0))fail(409,'Tamu sudah tercatat tiba. Koreksi catatan check-in sebelum mengubah RSVP menjadi tidak hadir atau belum konfirmasi.');
    }
    const now=new Date(Math.max(Date.now(),old?Date.parse(old.updated_at)+1:0)).toISOString(),newId=id();
    const isSame=Boolean(old&&old.status===status&&old.guest_count===count);
    if(isSame)return json({saved:true,unchanged:true,response:{event_id:event,status,guest_count:count,updated_at:old.updated_at},receptionTable:inv.reception_table||'',seatReassignmentRequired:false});
    const returning=event==='reception'&&status!=='declined';
    const reassign=Boolean(returning&&inv.reception_table&&(await reservedSeats(env,inv.reception_table,inv.id))+inv.seats>TABLE_CAPACITY);
    const upsert=old
     ?prep(env,'UPDATE responses SET status=?,guest_count=?,updated_at=? WHERE id=? AND updated_at=?',status,count,now,old.id,old.updated_at)
     :prep(env,'INSERT INTO responses (id,invitation_id,event_id,status,guest_count,message,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(invitation_id,event_id) DO NOTHING',newId,inv.id,event,status,count,'',now);
    const afterValue={status,guestCount:count,source,note};
    const statements=[upsert];
    if(reassign)statements.push(prep(env,"UPDATE invitations SET reception_table='',updated_at=? WHERE id=? AND reception_table=?",now,inv.id,inv.reception_table));
    statements.push(prep(env,'INSERT INTO journey_activity (id,subject_key,event_id,action,before_value,after_value,created_at,actor) SELECT ?,?,?,?, ?,?,?,? WHERE EXISTS (SELECT 1 FROM responses WHERE invitation_id=? AND event_id=? AND id=? AND updated_at=? AND status=? AND guest_count=?)',
      id(),'invitation:'+inv.id,event,'rsvp_admin',JSON.stringify(old?{status:old.status,guestCount:old.guest_count,updatedAt:old.updated_at}:null),JSON.stringify(afterValue),now,admin.email,inv.id,event,old?.id||newId,now,status,count));
    await db(env).batch(statements);
    const saved=await first(env,'SELECT id,status,guest_count,message,updated_at FROM responses WHERE invitation_id=? AND event_id=?',inv.id,event);
    if(saved?.id!==(old?.id||newId)||saved.updated_at!==now)fail(409,'Jawaban tamu berubah saat disimpan. Segarkan data dan coba lagi.');
    return json({saved:true,response:{event_id:event,status:saved.status,guest_count:saved.guest_count,updated_at:saved.updated_at},receptionTable:reassign?'':inv.reception_table||'',seatReassignmentRequired:reassign});
   }
   if(!inviteMatch[2]&&method==='DELETE'){
    const confirmation=await body(request);if(confirmation.slug!==inv.slug)fail(400,'Undangan yang dikonfirmasi tidak sesuai.');
    const proofs=await all(env,'SELECT proof_key FROM gifts WHERE invitation_id=?',inv.id);
    await db(env).batch([
     prep(env,'DELETE FROM reading_progress WHERE invitation_id=?',inv.id),
     prep(env,'DELETE FROM gift_activity WHERE invitation_id=?',inv.id),
     prep(env,'DELETE FROM guest_messages WHERE invitation_id=?',inv.id),
     prep(env,'DELETE FROM gifts WHERE invitation_id=?',inv.id),
     prep(env,'DELETE FROM opens WHERE invitation_id=?',inv.id),
     prep(env,'DELETE FROM responses WHERE invitation_id=?',inv.id),
     prep(env,'DELETE FROM invitations WHERE id=?',inv.id)
    ]);
    if(env.BUCKET){const cleanup=Promise.all(proofs.filter(p=>p.proof_key).map(p=>env.BUCKET.delete(p.proof_key))).catch(()=>console.error('Invitation proof cleanup failed'));if(ctx?.waitUntil)ctx.waitUntil(cleanup);else await cleanup;}
    return json({deleted:true,id:inv.id});
   }
   if(inviteMatch[2]==='link'&&method==='GET')return json({sharePath:`/${inv.slug}?key=${inv.access_token}`});
   if(inviteMatch[2]==='shared'&&method==='POST'){await body(request);const now=stamp();await run(env,'UPDATE invitations SET shared_at = ?,updated_at = ? WHERE id = ?',now,now,inv.id);return json({sharedAt:now});}
   if(!inviteMatch[2]&&method==='PATCH'){const data=await body(request),seats=integer(data.seats,1,20),ids=eventIds(data.eventIds),table=receptionTable(data.receptionTable,ids);const previous=await all(env,"SELECT guest_count FROM responses WHERE invitation_id = ? AND status = 'attending'",inv.id);if(previous.some(r=>r.guest_count>seats))fail(409,'Jumlah kursi tidak boleh lebih kecil dari RSVP yang sudah masuk.');const arrivals=await all(env,'SELECT event_id,checked_in,seated FROM journey_attendance WHERE invitation_id=?',inv.id);if(arrivals.some(r=>r.checked_in>seats))fail(409,'Jumlah kursi tidak boleh lebih kecil dari tamu yang sudah check-in.');if(arrivals.some(r=>r.checked_in>0&&(!data.active||!ids.includes(r.event_id))))fail(409,'Koreksi check-in sebelum menonaktifkan undangan atau menghapus acara yang sudah dihadiri.');if(!table&&arrivals.some(r=>r.event_id==='reception'&&r.seated>0))fail(409,'Koreksi jumlah tamu yang sudah duduk sebelum mengosongkan meja.');if(typeof data.active!=='boolean')fail(400,'Status undangan tidak valid.');if(data.active&&table){const currentRsvp=await first(env,"SELECT status FROM responses WHERE invitation_id=? AND event_id='reception'",inv.id);if(currentRsvp?.status!=='declined')await checkTableCapacity(env,table,seats,inv.id);}await run(env,'UPDATE invitations SET guest_name=?,salutation=?,phone=?,seats=?,event_ids=?,reception_table=?,private_note=?,active=?,updated_at=? WHERE id=?',text(data.guestName,100,true),salutation(data.salutation),text(data.phone,30),seats,JSON.stringify(ids),table,text(data.privateNote,500),data.active?1:0,stamp(),inv.id);return json({invitation:adminInvite(await first(env,'SELECT * FROM invitations WHERE id=?',inv.id))});}
  }
  if(path==='/api/admin/gifts'&&method==='POST'){
   const data=await body(request),inv=await first(env,'SELECT * FROM invitations WHERE id=?',text(data.invitationId,64,true));if(!inv)fail(404,'Tamu tidak ditemukan.');const gift=giftInput(data),now=stamp(),giftId=id();if(!['confirmed','reported'].includes(data.status))fail(400,'Status hadiah tidak valid.');const requestId=text(data.requestId,64,true);if(!/^[a-zA-Z0-9-]{8,64}$/.test(requestId))fail(400,'ID permintaan tidak valid.');await run(env,'INSERT INTO gifts (id,invitation_id,request_id,kind,amount,note,status,source,created_at,verified_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(invitation_id,request_id) DO NOTHING',giftId,inv.id,requestId,gift.kind,gift.amount,gift.note,data.status,'admin',now,data.status==='confirmed'?now:null);return json({gift:await first(env,'SELECT * FROM gifts WHERE invitation_id=? AND request_id=?',inv.id,requestId)},201);
  }
  const giftMatch=path.match(/^\/api\/admin\/gifts\/([a-zA-Z0-9-]+)(?:\/(proof))?$/);
  if(giftMatch&&giftMatch[2]==='proof'&&method==='GET'){const gift=await first(env,'SELECT proof_key FROM gifts WHERE id=?',giftMatch[1]);if(!gift?.proof_key)fail(404,'Bukti transfer tidak ditemukan.');if(!env.BUCKET)fail(503,'Penyimpanan bukti transfer belum tersedia.');const object=await env.BUCKET.get(gift.proof_key);if(!object)fail(404,'Bukti transfer tidak ditemukan.');const ext=gift.proof_key.split('.').pop(),mime={pdf:'application/pdf',webp:'image/webp',jpg:'image/jpeg',png:'image/png',avif:'image/avif'}[ext];return new Response(object.body,{headers:{'Content-Type':mime,'Content-Disposition':`inline; filename="bukti-transfer.${ext}"`,'Cache-Control':'private,no-store'}});}
  if(giftMatch&&!giftMatch[2]&&method==='PATCH'){const data=await body(request);if(!['reported','confirmed','cancelled'].includes(data.status))fail(400,'Status hadiah tidak valid.');const gift=await first(env,'SELECT * FROM gifts WHERE id=?',giftMatch[1]);if(!gift)fail(404,'Hadiah tidak ditemukan.');await run(env,'UPDATE gifts SET status=?,verified_at=? WHERE id=?',data.status,data.status==='confirmed'?stamp():null,gift.id);return json({gift:await first(env,'SELECT * FROM gifts WHERE id=?',gift.id)});}
  fail(404,'Halaman admin tidak ditemukan.');
 }
const guestMatch=path.match(/^\/api\/invitation\/([a-z0-9-]+)(?:\/(opened|rsvp|gift|heart))?$/);
 if(guestMatch){const inv=!guestMatch[2]&&method==='GET'?await invitationBySlug(env,guestMatch[1]):await guestInvitation(request,env,guestMatch[1]);if(!inv)fail(404,'Undangan tidak ditemukan atau sudah dinonaktifkan.');const ids=JSON.parse(inv.event_ids);
  if(!guestMatch[2]&&method==='GET'){const preview=await isAdmin(request,env),authorized=hasGuestAccess(request,inv);const responses=preview||authorized?await all(env,'SELECT event_id,status,guest_count,message,updated_at FROM responses WHERE invitation_id=?',inv.id):[];return json({invitation:publicInvite(inv,preview||authorized),responses:responses.filter(r=>ids.includes(r.event_id)),events:(await getEvents(env)).filter(e=>ids.includes(e.id)),preview,accessRequired:!preview&&!authorized});}
  if(guestMatch[2]==='opened'&&method==='POST'){const data=await body(request);if(await isAdmin(request,env))return json({recorded:false,preview:true});const visitId=text(data.visitId,64,true);if(!/^[a-zA-Z0-9-]{8,64}$/.test(visitId))fail(400,'ID kunjungan tidak valid.');await db(env).batch([prep(env,'INSERT INTO opens (id,invitation_id,visit_id,opened_at) VALUES (?,?,?,?) ON CONFLICT(invitation_id,visit_id) DO NOTHING',id(),inv.id,visitId,stamp()),prep(env,'UPDATE invitations SET first_opened_at=(SELECT MIN(opened_at) FROM opens WHERE invitation_id=?),last_opened_at=(SELECT MAX(opened_at) FROM opens WHERE invitation_id=?),open_count=(SELECT COUNT(*) FROM opens WHERE invitation_id=?) WHERE id=?',inv.id,inv.id,inv.id,inv.id)]);return json({recorded:true});}
  if(guestMatch[2]==='heart'&&method==='POST'){await body(request);if(await isAdmin(request,env))fail(403,'Mode preview admin: hati tidak dicatat.');await run(env,'UPDATE invitations SET heart_count=heart_count+1,last_heart_at=? WHERE id=? AND heart_count<10000',stamp(),inv.id);const row=await first(env,'SELECT heart_count FROM invitations WHERE id=?',inv.id);return json({heartCount:row.heart_count});}
  if(guestMatch[2]==='rsvp'&&method==='POST'){const data=await body(request);if(await isAdmin(request,env))fail(403,'Mode preview admin: RSVP tidak dikirim sebagai tamu.');if(!Array.isArray(data.responses)||data.responses.length!==ids.length||new Set(data.responses.map(r=>r.eventId)).size!==ids.length)fail(400,'Isi konfirmasi untuk setiap acara yang diundang.');const previous=await all(env,'SELECT event_id,status,guest_count,message,updated_at FROM responses WHERE invitation_id=?',inv.id);
   const now=new Date(Math.max(Date.now(),...previous.map(r=>Date.parse(r.updated_at)+1))).toISOString();const statements=data.responses.map(r=>{if(!ids.includes(r.eventId)||!['attending','declined'].includes(r.status))fail(400,'Pilihan kehadiran tidak valid.');const count=r.status==='attending'?integer(r.guestCount,1,inv.seats):0,old=previous.find(row=>row.event_id===r.eventId);
    if(Object.hasOwn(r,'expectedUpdatedAt')&&r.expectedUpdatedAt!==(old?.updated_at||null))fail(409,'RSVP telah diperbarui oleh admin atau perangkat lain. Muat ulang halaman untuk melihat jawaban terbaru.');
    return prep(env,'INSERT INTO responses (id,invitation_id,event_id,status,guest_count,message,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(invitation_id,event_id) DO UPDATE SET status=excluded.status,guest_count=excluded.guest_count,message=excluded.message,updated_at=excluded.updated_at WHERE responses.updated_at=?',id(),inv.id,r.eventId,r.status,count,old?.message||text(data.message,500),now,old?.updated_at||null);});// If a guest changes from declined to attending after a seat has been reused, avoid overbooking.
   const returning=data.responses.some(r=>r.eventId==='reception'&&r.status==='attending');
   const reassign=Boolean(returning&&inv.reception_table&&(await reservedSeats(env,inv.reception_table,inv.id))+inv.seats>TABLE_CAPACITY);
   if(reassign)statements.push(prep(env,"UPDATE invitations SET reception_table='',updated_at=? WHERE id=? AND reception_table=?",now,inv.id,inv.reception_table));
   await db(env).batch(statements);
   const saved=await all(env,'SELECT event_id,status,guest_count,message,updated_at FROM responses WHERE invitation_id=?',inv.id);
   return json({saved:true,responses:saved.filter(r=>ids.includes(r.event_id)),updatedAt:now,receptionTable:reassign?'':inv.reception_table||'',seatReassignmentRequired:reassign});}
  if(guestMatch[2]==='gift'&&method==='POST'){if(await isAdmin(request,env))fail(403,'Catat hadiah melalui halaman admin.');const {data,proof}=await giftSubmission(request),gift=giftInput(data),requestId=text(data.requestId,64,true);if(!/^[a-zA-Z0-9-]{8,64}$/.test(requestId))fail(400,'ID permintaan tidak valid.');const existing=await first(env,'SELECT id,proof_key FROM gifts WHERE invitation_id=? AND request_id=?',inv.id,requestId);if(existing)return json({saved:true,status:'reported',hasProof:Boolean(existing.proof_key)},201);const total=await first(env,'SELECT COUNT(*) AS count FROM gifts WHERE invitation_id=?',inv.id);if(total.count>=10)fail(429,'Batas konfirmasi hadiah tercapai. Hubungi (nama pria) & (nama wanita).');let proofKey=data.proofTicket?await verifiedProofKey(data.proofTicket,inv.id,env,fail):null;if(proofKey&&gift.kind!=='transfer')fail(400,'Bukti transfer hanya untuk hadiah transfer.');if(proofKey&&proof)fail(400,'Pilih satu berkas bukti transfer.');if(proof){if(!env.BUCKET)fail(503,'Penyimpanan bukti transfer belum tersedia.');const bytes=new Uint8Array(await proof.arrayBuffer()),[ext,mime]=proofFormat(bytes);proofKey=`gift-proofs/${id()}.${ext}`;await env.BUCKET.put(proofKey,bytes,{httpMetadata:{contentType:mime}});}try{await run(env,"INSERT INTO gifts (id,invitation_id,request_id,kind,amount,note,status,source,created_at,proof_key) VALUES (?,?,?,?,?,?,'reported','guest',?,?) ON CONFLICT(invitation_id,request_id) DO NOTHING",id(),inv.id,requestId,gift.kind,gift.amount,gift.note,stamp(),proofKey);}catch(error){if(proofKey&&env.BUCKET.delete)await env.BUCKET.delete(proofKey).catch(()=>{});throw error;}return json({saved:true,status:'reported',hasProof:Boolean(proofKey)},201);}
  fail(405,'Metode tidak didukung.');
 }
 if(path.startsWith('/api/'))fail(404,'Layanan tidak ditemukan.');
 if(path==='/admin/signout'&&method==='GET')return new Response(null,{status:303,headers:{'Location':'/','Set-Cookie':'sj_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax','Cache-Control':'private,no-store'}});
 if(path==='/admin'||path==='/admin.html'){
  if(!await getAdminCookie(request,env)){const login=await asset(request,env,'/admin-login.html');return new Response(login.body,{headers:{...Object.fromEntries(login.headers),'Cache-Control':'private,no-store'}});}
  const page=await asset(request,env,'/wedding-desk-shell.html');return new Response(page.body,{headers:{...Object.fromEntries(page.headers),'Cache-Control':'private,no-store'}});
 }
 if(path==='/robots.txt')return new Response('User-agent: *\nDisallow: /admin\nDisallow: /api/\n',{headers:{'Content-Type':'text/plain'}});
 if(path==='/'||path==='/index.html')return asset(request,env,'/index.html');
 const slugMatch=path.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
 if(slugMatch&&!RESERVED.has(slugMatch[1])){const inv=await invitationBySlug(env,slugMatch[1]);if(!inv)fail(404,'Undangan tidak ditemukan atau sudah dinonaktifkan.');
  if(url.searchParams.has('key')){const access=url.searchParams.get('key');if(access!==inv.access_token)fail(403,'Kode undangan tidak valid. Minta tautan terbaru dari (nama pria) & (nama wanita).');const headers={'Location':`/${inv.slug}`,'Cache-Control':'private,no-store','Referrer-Policy':'no-referrer','Set-Cookie':`sj_guest_${inv.slug}=${access}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax${url.protocol==='https:'?'; Secure':''}`};return new Response(null,{status:303,headers});}
  const page=await asset(request,env,'/index.html');return new Response(page.body,{headers:{...Object.fromEntries(page.headers),'Cache-Control':'private,no-store','X-Robots-Tag':'noindex, nofollow'}});
 }
 if(!['GET','HEAD'].includes(method))fail(405,'Metode tidak didukung.');return env.ASSETS.fetch(request);
}
