// Temporary migration helper for the existing legacy Worker only. Never imported by Vercel.
export function legacyMediaExport({expiresAt,tokenHash,adminCookie}){
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private,no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return async(request,env)=>{
  const u=new URL(request.url);
  if(!['/api/admin/migration-media','/api/admin/migration-media/object'].includes(u.pathname))return null;
  if(env.RUNTIME==='vercel'||Date.now()>=expiresAt)return json({error:'Not found'},404);
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const token=request.headers.get('x-wedding-export-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Unauthorized'},401);
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  let difference=digest.length^tokenHash.length;for(let i=0;i<digest.length;i++)difference|=digest.charCodeAt(i)^(tokenHash.charCodeAt(i)||0);
  if(difference||!await adminCookie(request,env))return json({error:'Unauthorized'},401);
  if(!env.BUCKET?.list||!env.BUCKET?.get)return json({error:'Original storage unavailable'},503);
  if(u.pathname.endsWith('/object')){
   const key=u.searchParams.get('key');if(!key||key.length>1024||/[\0\r\n]/.test(key))return json({error:'Invalid object'},400);
   const object=await env.BUCKET.get(key);if(!object)return json({error:'Not found'},404);
   const headers=new Headers({'Cache-Control':'private,no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':object.httpMetadata?.contentType||'application/octet-stream'});
   if(object.httpEtag)headers.set('ETag',object.httpEtag);if(Number.isSafeInteger(object.size))headers.set('Content-Length',String(object.size));
   return new Response(object.body,{headers});
  }
  const cursor=u.searchParams.get('cursor')||undefined;if(cursor&&(cursor.length>4096||/[\0\r\n]/.test(cursor)))return json({error:'Invalid cursor'},400);
  const result=await env.BUCKET.list({limit:1000,cursor,include:['httpMetadata']});
  return json({source:{project:'appgprj_6ab47d5e1fb4819180cbf349e343f66f',binding:'BUCKET'},objects:result.objects.map(o=>({key:o.key,size:o.size,etag:o.httpEtag||'"'+o.etag+'"',contentType:o.httpMetadata?.contentType||null})),truncated:result.truncated,cursor:result.truncated?result.cursor:null});
 };
}
