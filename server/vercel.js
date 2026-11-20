import {readFile} from 'node:fs/promises';
import path from 'node:path';
import worker from '../worker/index.js';
import {createStorage} from './storage.js';

const PAGES=new Set(['/index.html','/admin-login.html','/wedding-desk-shell.html']);
export function createPageAssets(root=path.resolve('dist/server-assets')){
 return {async fetch(request){
  const pathname=new URL(request.url).pathname;if(!PAGES.has(pathname))return new Response('Not found',{status:404});
  try{const bytes=await readFile(path.join(root,pathname.slice(1)));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'private,no-store'}});}
  catch{return new Response('Not found',{status:404});}
 }};
}
export function createVercelHandler({environment=()=>process.env,pages=createPageAssets(),storage=createStorage,waitUntil=promise=>promise.catch(()=>console.error('Background wedding task failed')),clientIp,country}={}){
 return async request=>{
  try{
   const url=new URL(request.url),routes=url.searchParams.getAll('__route');
   if(routes.length>1)return Response.json({error:'Tautan tidak valid.'},{status:400,headers:{'Cache-Control':'private,no-store'}});
   if(routes.length){const route=routes[0];if(!/^\/(?:api(?:\/[^?#]*)?|media\/[^?#]+|admin(?:\.html|\/signout)?\/?|[a-z0-9]+(?:-[a-z0-9]+)*\/?$)/.test(route))return new Response('Not found',{status:404});url.pathname=route;url.searchParams.delete('__route');}
   const headers=new Headers(request.headers);
   // Identity headers are untrusted on Vercel. Only signed application cookies authorize admins.
   for(const key of [...headers.keys()])if(key.startsWith('oai-')||key.startsWith('cf-')||['x-real-ip','x-forwarded-host','x-forwarded-proto'].includes(key))headers.delete(key);
   const ip=clientIp?.(request)||'unknown',nation=country?.(request)||'';
   headers.set('cf-connecting-ip',ip);headers.set('cf-ipcountry',/^[A-Z]{2}$/.test(nation)?nation:'');headers.delete('x-forwarded-for');
   const input=environment();
   // Explicitly selected server keys: no Cloudflare binding or fallback origin is accepted.
   const env={SUPABASE_DB_ENABLED:'true',RUNTIME:'vercel',SUPABASE_URL:input.SUPABASE_URL,WEDDING_DB_TOKEN:input.WEDDING_DB_TOKEN,
    SUPABASE_STORAGE_KEY:input.SUPABASE_STORAGE_KEY,ADMIN_EMAIL:input.ADMIN_EMAIL,ADMIN_ACCESS_CODE:input.ADMIN_ACCESS_CODE,
    ADMIN_SESSION_SECRET:input.ADMIN_SESSION_SECRET,OPENAI_API_KEY:input.OPENAI_API_KEY,ASSETS:pages};
   env.BUCKET=storage(env);
   const forwarded=new Request(url,{method:request.method,headers,signal:request.signal,...(!['GET','HEAD'].includes(request.method)?{body:request.body,duplex:'half'}:{})});
   const response=await worker.fetch(forwarded,env,{waitUntil});
   return request.method==='HEAD'?new Response(null,response):response;
  }catch{
   console.error('Wedding Vercel request failed');
   return Response.json({error:'Layanan belum tersedia. Data belum disimpan; silakan coba lagi.'},{status:503,headers:{'Cache-Control':'private,no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
 };
}
