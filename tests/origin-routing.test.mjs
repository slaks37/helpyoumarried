import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker/index.js';
import {createLocalDB} from '../scripts/local-db.mjs';

const origin='https://stefen-jessica-forever.site';
const agents={
 android:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36',
 samsung:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
 whatsapp:'WhatsApp/2.24.20.87 A',
 safari:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
 desktop:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36'
};
async function fixture(){
 const DB=await createLocalDB();
 const env={DB,ADMIN_EMAIL:'owner@example.com',ADMIN_ACCESS_CODE:'local-routing-test-code',ADMIN_SESSION_SECRET:'routing-regression-test-secret-only',ASSETS:{fetch:async request=>new Response('<!doctype html><html>Wedding invitation</html>',{headers:{'Content-Type':'text/html','Cache-Control':'public,max-age=3600'}})}};
 const call=(path,options={})=>worker.fetch(new Request(origin+path,options),env,{});
 const created=await call('/api/admin/invitations',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'},body:JSON.stringify({guestName:'Routing Test Couple',slug:'routing-test',seats:2,eventIds:['reception']})});
 assert.equal(created.status,201);
 return {DB,call,sharePath:(await created.json()).sharePath};
}
function noStore(response){for(const name of ['Cache-Control','CDN-Cache-Control','Vercel-CDN-Cache-Control'])assert.match(response.headers.get(name),/no-store/,name);}

test('mobile user-agent profiles keep token exchange, cookies and invitation redirects on the public host',async()=>{
 const {DB,call,sharePath}=await fixture();
 try{for(const [profile,agent] of Object.entries(agents)){
  const headers={'User-Agent':agent,'X-Forwarded-Host':'attacker.example','X-Forwarded-Proto':'http'};
  const slash=await call(sharePath.replace('?','/?'),{headers});
  assert.equal(slash.status,308,profile);assert.equal(slash.headers.get('Location'),sharePath);noStore(slash);
  const exchange=await call(slash.headers.get('Location'),{headers});
  assert.equal(exchange.status,303,profile);assert.equal(exchange.headers.get('Location'),'/routing-test');noStore(exchange);
  const raw=exchange.headers.get('Set-Cookie');assert.match(raw,/HttpOnly/);assert.match(raw,/Secure/);assert.match(raw,/SameSite=Lax/);assert.doesNotMatch(raw,/Domain=/i);
  headers.Cookie=raw.split(';')[0];
  const page=await call('/routing-test',{headers});assert.equal(page.status,200);assert.match(await page.text(),/Wedding invitation/);noStore(page);
  const guest=await call('/api/invitation/routing-test',{headers});assert.equal(guest.status,200);assert.equal((await guest.json()).accessRequired,false);
  assert.doesNotMatch(page.headers.get('Content-Security-Policy'),/chatgpt\.site/);
 }}finally{DB.close();}
});
test('canonical redirects cover HEAD, admin and repeated trailing slashes without leaking upstream URLs',async()=>{
 const {DB,call}=await fixture();try{
  for(const method of ['GET','HEAD'])for(const path of ['/admin/','/admin/signout/','/routing-test///','/api/locale/']){
   const response=await call(path,{method});assert.equal(response.status,308);assert.equal(response.headers.get('Location'),path.replace(/\/+$/,''));noStore(response);
  }
  for(const path of ['//attacker.example/','/%2fattacker.example/','/%5cattacker.example/']){
   const response=await call(path);assert.equal(response.status,400);assert.equal(response.headers.get('Location'),null);
  }
 }finally{DB.close();}
});
test('admin, authentication errors, guest pages and invalid APIs never inherit public asset caching',async()=>{
 const {DB,call}=await fixture();try{
  for(const path of ['/admin','/admin.html','/admin/signout','/routing-test','/api/admin/session','/api/does-not-exist','/missing-guest'])noStore(await call(path));
  const denied=await call('/api/admin/invitations');assert.equal(denied.status,401);assert.match(denied.headers.get('Content-Type'),/application\/json/);
  const missing=await call('/api/does-not-exist');assert.equal(missing.status,404);assert.match(missing.headers.get('Content-Type'),/application\/json/);
  const publicAsset=await call('/assets/test.webp');assert.match(publicAsset.headers.get('Cache-Control'),/public/);
 }finally{DB.close();}
});
test('Vercel sends every dynamic route to the internal backend and disables rewrite caching',async()=>{
 const config=JSON.parse(await readFile('vercel.json','utf8'));
 assert.equal(config.trailingSlash,undefined);
 for(const source of ['/admin/signout/','/admin/','/:slug/'])assert.equal(config.rewrites.find(r=>r.source===source)?.destination,'/api/backend?__route='+source);
 for(const source of ['/api/:path*','/media/:path*','/admin','/admin/signout','/admin.html','/:slug']){
  const rule=config.rewrites.find(r=>r.source===source);assert.ok(rule,source);assert.equal(rule.destination,'/api/backend?__route='+source);assert.doesNotMatch(rule.destination,/https?:|chatgpt\.site/);
 }
 for(const source of ['/api/:path*','/admin','/admin/:path*','/admin.html','/:slug([a-z0-9-]+)']){
  const rule=config.headers.find(r=>r.source===source);assert.ok(rule,source);
  const headers=new Headers(rule.headers.map(h=>[h.key,h.value]));assert.equal(headers.get('x-vercel-enable-rewrite-caching'),'0');assert.match(headers.get('Vercel-CDN-Cache-Control'),/no-store/);
 }
});
