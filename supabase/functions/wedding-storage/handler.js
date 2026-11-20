const PROJECT='lgwrwymrjcptoztjvbxz.supabase.co';
const BUCKETS=new Set(['wedding-gallery','wedding-private','wedding-staging','wedding-archive']);
const keyPattern={
 'wedding-gallery':/^[a-f0-9-]{36}\.(jpg|png|webp|avif)$/,
 'wedding-private':/^gift-proofs\/[a-f0-9-]{36}\.(jpg|png|webp|avif|pdf)$/,
 'wedding-staging':/^staging\/(photos|proofs)\/[a-f0-9-]{36}\.(jpg|png|webp|avif|pdf)$/,
 'wedding-archive':/^[^\0\r\n]{1,1024}$/
};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return d===0;};
export function storageGateway({url,serviceKey,tokenHashes,fetcher=fetch}){
 const reply=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  try{
   const input=new URL(request.url),route=input.pathname.replace(/^\/(?:functions\/v1\/)?wedding-storage(?=\/|$)/,'');
   if(route===input.pathname||input.search)return reply('Not found',404);
   const token=request.headers.get('x-wedding-storage-token')||'';
   if(!/^wedding_storage_(?:preview_)?[a-f0-9]{64}$/.test(token))return reply('Unauthorized',401);
   const digest=await hash(token),preview=equal(digest,tokenHashes.preview),runtime=equal(digest,tokenHashes.runtime);
   if(!preview&&!runtime)return reply('Unauthorized',401);
   const origin=new URL(url);if(origin.protocol!=='https:'||origin.hostname!==PROJECT||!serviceKey)return reply('Storage unavailable',503);
   const physical=bucket=>preview?bucket.replace('wedding-','wedding-qa-'):bucket;
   const validKey=(bucket,key)=>BUCKETS.has(bucket)&&keyPattern[bucket].test(key)&&!key.split('/').some(p=>p==='.'||p==='..'||!p);
   let target,body,method=request.method,headers=new Headers();
   const mime=request.headers.get('content-type');if(mime)headers.set('Content-Type',mime);headers.set('x-upsert','false');
   const bucketMatch=route.match(/^\/bucket\/([a-z-]+)$/),signed=route.match(/^\/object\/upload\/sign\/([a-z-]+)\/(.+)$/),object=route.match(/^\/object\/([a-z-]+)(?:\/(.*))?$/);
   if(bucketMatch&&method==='GET'&&BUCKETS.has(bucketMatch[1]))target='/bucket/'+physical(bucketMatch[1]);
   else if(route==='/bucket'&&method==='POST'){
    const data=await request.json(),id=data.id;if(!BUCKETS.has(id)||data.public!==false)return reply('Only private wedding buckets are allowed',400);
    const maximum=id==='wedding-archive'?50000000:id==='wedding-private'?5000000:8000000;
    body=JSON.stringify({id:physical(id),name:physical(id),public:false,file_size_limit:maximum,...(id==='wedding-archive'?{}:{allowed_mime_types:id==='wedding-gallery'?['image/jpeg','image/png','image/webp','image/avif']:['image/jpeg','image/png','image/webp','image/avif','application/pdf']})});headers.set('Content-Type','application/json');target='/bucket';
   }else if(signed&&method==='POST'){
    const [,bucket,encoded]=signed,key=decodeURIComponent(encoded);if(bucket!=='wedding-staging'||!validKey(bucket,key))return reply('Invalid staging object',400);
    target='/object/upload/sign/'+physical(bucket)+'/'+key.split('/').map(encodeURIComponent).join('/');
   }else if(object){
    const [,bucket,encoded]=object;if(!BUCKETS.has(bucket))return reply('Not found',404);
    if(method==='DELETE'&&encoded===undefined&&bucket!=='wedding-archive'){
     const data=await request.json();if(!Array.isArray(data.prefixes)||data.prefixes.length!==1||!validKey(bucket,data.prefixes[0]))return reply('Invalid object deletion',400);
     body=JSON.stringify({prefixes:data.prefixes});headers.set('Content-Type','application/json');target='/object/'+physical(bucket);
    }else if(['GET','POST'].includes(method)&&encoded){
     const key=decodeURIComponent(encoded);if(!validKey(bucket,key))return reply('Invalid object',400);
     target='/object/'+physical(bucket)+'/'+key.split('/').map(encodeURIComponent).join('/');
     if(method==='POST'){
      const max=bucket==='wedding-archive'?50000000:bucket==='wedding-private'?5000000:8000000;
      if(Number(request.headers.get('content-length')||0)>max)return reply('Object too large',413);
      const chunks=[];let length=0;for await(const chunk of request.body||[]){length+=chunk.byteLength;if(length>max)return reply('Object too large',413);chunks.push(chunk);}
      body=new Uint8Array(length);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.byteLength;}
     }
    }else return reply('Method not allowed',405);
   }else return reply('Not found',404);
   headers.set('apikey',serviceKey);headers.set('Authorization','Bearer '+serviceKey);
   const response=await fetcher(origin.origin+'/storage/v1'+target,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(60000)});
   const out=new Headers({'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'});
   for(const name of ['content-type','content-length','etag'])if(response.headers.has(name))out.set(name,response.headers.get(name));
   return new Response(response.body,{status:response.status,headers:out});
  }catch{return reply('Storage operation failed',503);}
 };
}
