const PROJECT='lgwrwymrjcptoztjvbxz.supabase.co';
export const BUCKETS={gallery:'wedding-gallery',private:'wedding-private',staging:'wedding-staging'};
export function storagePath(key){
 if(/^[a-f0-9-]{36}\.(?:jpg|png|webp|avif)$/.test(key))return {bucket:BUCKETS.gallery,key};
 if(/^gift-proofs\/[a-f0-9-]{36}\.(?:pdf|jpg|png|webp|avif)$/.test(key))return {bucket:BUCKETS.private,key};
 if(/^staging\/(?:photos|proofs)\/[a-f0-9-]{36}\.(?:pdf|jpg|png|webp|avif)$/.test(key))return {bucket:BUCKETS.staging,key};
 throw new Error('Invalid storage object key');
}
export function createStorage(env,fetcher=fetch){
 function config(){
  if(!env.SUPABASE_URL||!env.SUPABASE_STORAGE_KEY)throw new Error('Supabase Storage is not configured');
  const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.hostname!==PROJECT||u.username||u.password)throw new Error('Invalid storage project');
  const bridge=/^wedding_storage_(?:preview_)?[a-f0-9]{64}$/.test(env.SUPABASE_STORAGE_KEY);
  return {origin:u.origin,key:env.SUPABASE_STORAGE_KEY,bridge,preview:bridge&&env.SUPABASE_STORAGE_KEY.startsWith('wedding_storage_preview_')};
 }
 async function send(path,options={}){
  const c=config(),headers=new Headers(options.headers);
  if(c.bridge)headers.set('x-wedding-storage-token',c.key);else{headers.set('Authorization','Bearer '+c.key);headers.set('apikey',c.key);}
  return fetcher(c.origin+(c.bridge?'/functions/v1/wedding-storage':'/storage/v1')+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(60000)});
 }
 const objectPath=key=>{const p=storagePath(key);return '/object/'+p.bucket+'/'+p.key.split('/').map(encodeURIComponent).join('/');};
 async function checked(response){if(!response.ok)throw new Error('Supabase Storage operation failed ('+response.status+')');return response;}
 return {
  async get(key){
   const r=await send(objectPath(key));if(r.status===404)return null;
   if(r.status===400){const error=await r.json().catch(()=>({}));if(['404','NoSuchKey','not_found'].includes(String(error.statusCode||error.code)))return null;throw new Error('Supabase Storage read failed');}
   await checked(r);return {body:r.body,size:Number(r.headers.get('Content-Length'))||null,httpMetadata:{contentType:r.headers.get('Content-Type')}};
  },
  async put(key,bytes,options={}){
   await checked(await send(objectPath(key),{method:'POST',headers:{'Content-Type':options.httpMetadata?.contentType||'application/octet-stream','x-upsert':'false'},body:bytes}));
  },
  async delete(key){const p=storagePath(key);await checked(await send('/object/'+p.bucket,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[p.key]})}));},
  async createSignedUpload(key,mime,size){
   const p=storagePath(key);if(p.bucket!==BUCKETS.staging)throw new Error('Uploads must use private staging');
   const r=await checked(await send('/object/upload/sign/'+p.bucket+'/'+p.key,{method:'POST',headers:{'x-upsert':'false'}}));
   const d=await r.json(),c=config();
   const physical=c.preview?p.bucket.replace('wedding-','wedding-qa-'):p.bucket;
   if(typeof d.url!=='string'||!d.url.startsWith('/object/upload/sign/'+physical+'/'))throw new Error('Invalid signed upload response');
   const url=new URL(c.origin+'/storage/v1'+d.url);if(url.hostname!==PROJECT||!url.searchParams.get('token'))throw new Error('Invalid signed upload URL');
   return url.href;
  }
 };
}
