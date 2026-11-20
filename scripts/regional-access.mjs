// Public network diagnostics only. Never accepts guest paths, tokens or cookies.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const API='https://api.globalping.io/v1/measurements';
const PUBLIC_HOST='stefen-jessica-forever.site';
const LEGACY_HOST='stefen-jessica-forever-office.stefenlaks.chatgpt.site';
const paths=new Set(['/','/api/locale','/api/content']);
export function validateDiagnostic(spec){
 if(![PUBLIC_HOST,LEGACY_HOST].includes(spec.target)||!['dns','http'].includes(spec.type))throw Error('Only fixed public diagnostic targets are allowed');
 if(spec.type==='http'){
  const r=spec.measurementOptions?.request;
  if(!r||!paths.has(r.path)||r.method!=='GET'||Object.keys(r).some(k=>!['path','method'].includes(k)))throw Error('Guest paths, queries, credentials and custom headers are forbidden');
 }
 return spec;
}
function location(value){
 if(!value)return null;
 try{const u=new URL(value,'https://'+PUBLIC_HOST);return {origin:u.origin,path:paths.has(u.pathname)?u.pathname:'[redacted-path]',queryPresent:!!u.search};}catch{return {invalid:true};}
}
export function sanitizeMeasurement(m){
 return {id:m.id,type:m.type,target:m.target,createdAt:m.createdAt,status:m.status,options:m.measurementOptions,results:(m.results||[]).map(({probe={},result={}})=>({
  probe:{country:probe.country,city:probe.city,asn:probe.asn,network:probe.network,tags:(probe.tags||[]).filter(t=>['eyeball-network','datacenter-network'].includes(t))},
  status:result.status,statusCode:result.statusCode,failureSource:result.failureSource,
  blocked:/you have been blocked|cf-error-details|cf-chl-|sorry, you have been blocked/i.test(result.rawBody||''),
  headers:Object.fromEntries(Object.entries(result.headers||{}).filter(([k])=>['server','content-type','cache-control','cf-ray','cf-mitigated','x-vercel-id','x-vercel-cache'].includes(k.toLowerCase()))),
  redirect:location(result.headers?.location),timings:result.timings,
  tls:result.tls?{authorized:result.tls.authorized,protocol:result.tls.protocol,expiresAt:result.tls.expiresAt,issuer:result.tls.issuer}:null,
  answers:result.answers?.map(a=>({name:a.name,type:a.type,value:a.value})),rcode:result.statusCodeName,
  error:result.status==='failed'?String(result.rawOutput||'').replace(/(?:\d{1,3}\.){3}\d{1,3}/g,'[address]').replace(/https?:\/\/\S+/g,'[url]').slice(0,350):undefined
 }))};
}
async function json(url,options){
 const r=await fetch(url,{...options,headers:{'User-Agent':'WeddingPublicDiagnostics/1.0','Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error('Globalping API HTTP '+r.status);
 return r.json();
}
async function run(){
 const locations=[{country:'KH',asn:45498,limit:1},{country:'KH',asn:23673,limit:1},{country:'KH',asn:17976,limit:1},{country:'KH',asn:154177,limit:1},{country:'SG',limit:1},{country:'ID',tags:['eyeball-network'],limit:1}];
 const http=(target,path,protocol='HTTPS',ipVersion=4)=>({type:'http',target,measurementOptions:{protocol,ipVersion,request:{method:'GET',path}}});
 const specs=[
  ...['A','AAAA'].map(type=>({type:'dns',target:PUBLIC_HOST,measurementOptions:{query:{type}}})),
  {type:'dns',target:LEGACY_HOST,measurementOptions:{query:{type:'A'}}},
  http(PUBLIC_HOST,'/'),http(PUBLIC_HOST,'/api/locale'),http(PUBLIC_HOST,'/api/content'),
  http(LEGACY_HOST,'/api/locale'),http(PUBLIC_HOST,'/','HTTP'),http(PUBLIC_HOST,'/','HTTPS',6)
 ];
 await mkdir('.local/diagnostics',{recursive:true,mode:0o700});
 const output=[];
 // Independent requests, capped at 54 probe tests and public GET/DNS only.
 await Promise.all(specs.map(async spec=>{
  validateDiagnostic(spec);
  const c=await json(API,{method:'POST',body:JSON.stringify({...spec,locations,timeout:30})});
  console.log(JSON.stringify({phase:'started',id:c.id,type:spec.type,target:spec.target,options:spec.measurementOptions}));
  let m;
  for(let i=0;i<30;i++){
   await new Promise(r=>setTimeout(r,2000));m=await json(API+'/'+encodeURIComponent(c.id));
   if(m.status!=='in-progress')break;
  }
  const safe={...sanitizeMeasurement(m),requestedOptions:spec.measurementOptions};output.push(safe);
  console.log(JSON.stringify({phase:'result',...safe}));
 }));
 output.sort((a,b)=>a.id.localeCompare(b.id));
 await writeFile('.local/diagnostics/regional-access-2026-10-30.json',JSON.stringify({capturedAt:new Date().toISOString(),provider:'Globalping',scope:'Public HTTP/DNS only; no real guest tokens or visits; network probes are not device/browser acceptance',measurements:output},null,2),{mode:0o600});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])run().catch(e=>{console.error(String(e.message));process.exitCode=1;});
