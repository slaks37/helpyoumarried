import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createLocalDB} from '../../scripts/local-db.mjs';
import {createVercelHandler,createPageAssets} from '../../server/vercel.js';

export async function runtime({base='https://wedding.test',pageRoot='public'}={}){
 const DB=await createLocalDB(),files=new Map(),requests=[],pending=[],originalFetch=globalThis.fetch;
 const scope={};runInNewContext((await readFile('supabase/functions/wedding-db/allowlist.ts','utf8')).replace('export const ALLOWED_SQL','const ALLOWED_SQL')+';this.allowed=ALLOWED_SQL;',scope);
 globalThis.fetch=async(url,options)=>{
  if(url!=='https://lgwrwymrjcptoztjvbxz.supabase.co/functions/v1/wedding-db')throw new Error('Unexpected runtime network target');
  const {operations}=JSON.parse(options.body);requests.push(operations);
  DB.sqlite.exec('BEGIN');try{const results=operations.map(op=>{
   if(!scope.allowed.has(op.sql))throw new Error('SQL not on the production allowlist');const s=DB.sqlite.prepare(op.sql);
   return op.mode==='first'?{rows:[s.get(...op.args)].filter(Boolean)}:op.mode==='all'?{rows:s.all(...op.args)}:(s.run(...op.args),{rows:[]});
  });DB.sqlite.exec('COMMIT');return Response.json({results});}catch(error){DB.sqlite.exec('ROLLBACK');throw error;}
 };
 const storage={
  async put(key,bytes,options){if(files.has(key))throw new Error('Object already exists');files.set(key,{bytes:new Uint8Array(bytes),mime:options?.httpMetadata?.contentType});},
  async get(key){const v=files.get(key);return v?{body:new Response(v.bytes).body,size:v.bytes.length}:null;},
  async delete(key){files.delete(key);},
  async createSignedUpload(key){return 'https://lgwrwymrjcptoztjvbxz.supabase.co/storage/v1/object/upload/sign/wedding-staging/'+key+'?token=test-only';}
 };
 const environment={SUPABASE_URL:'https://lgwrwymrjcptoztjvbxz.supabase.co',WEDDING_DB_TOKEN:'a'.repeat(64),ADMIN_EMAIL:'owner@example.com',ADMIN_ACCESS_CODE:'local-wedding-test-code-123456',ADMIN_SESSION_SECRET:'test-only-session-key-not-a-production-key'};
 const handle=createVercelHandler({environment:()=>environment,pages:createPageAssets(pageRoot),storage:()=>storage,waitUntil:p=>pending.push(p),clientIp:()=> '127.0.0.1',country:()=> 'ID'});
 const call=(route,{method='GET',body,headers={},rewritten=true}={})=>{
  const src=new URL(route,base),target=rewritten&&src.pathname!=='/'?new URL('/api/backend',base):src;
  if(target!==src){target.search=src.search;target.searchParams.append('__route',src.pathname);}
  return handle(new Request(target,{method,headers:{...headers,...(body?{'Content-Type':'application/json',Origin:base}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 };
 const login=async()=>{const r=await call('/api/admin/login',{method:'POST',body:{code:environment.ADMIN_ACCESS_CODE}});if(r.status!==200)throw new Error('Fixture login failed');return {Cookie:r.headers.getSetCookie().find(c=>c.startsWith('sj_admin=')).split(';')[0]};};
 return {DB,files,storage,environment,handle,call,login,requests,async close(){await Promise.allSettled(pending);globalThis.fetch=originalFetch;DB.close();}};
}
