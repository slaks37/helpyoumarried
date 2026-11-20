// Read-only HTTP probes. User-agent profiles are not real-device/browser tests.
// Output excludes queries so invitation tokens cannot appear in logs.
const origin=new URL(process.env.WEDDING_SMOKE_ORIGIN||'https://stefen-jessica-forever.site');
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.username||origin.password)throw new Error('Use an HTTPS origin without a path or credentials.');
const slug=process.env.WEDDING_SMOKE_SLUG||'triyono-ribka';
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Invalid smoke-test slug.');
const profiles={
 desktop:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36',
 android:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36',
 samsung:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
 whatsapp:'WhatsApp/2.24.20.87 A',
 safari:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
};
async function probe(path,agent,expected,type){
 const response=await fetch(new URL(path,origin),{headers:{'User-Agent':agent},redirect:'manual',signal:AbortSignal.timeout(30000)});
 const location=response.headers.get('Location'),destination=location?new URL(location,origin):null;
 const reader=response.body?.getReader();let bytes=0,text='';
 if(reader)try{while(bytes<65536){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;text+=new TextDecoder().decode(chunk.value);}}finally{await reader.cancel();}
 const blocked=/you have been blocked|unable to access chatgpt\.site|cf-error-details|cf-chl-/i.test(text),contentType=response.headers.get('Content-Type')||'';
 const passed=response.status===expected&&!blocked&&contentType.includes(type)&&(!destination||destination.origin===origin.origin);
 return {path,status:response.status,passed,blocked,type:contentType,location:destination?destination.origin+destination.pathname:null,noStore:/no-store/.test(response.headers.get('Cache-Control')||'')};
}
let failed=false;
for(const [profile,agent] of Object.entries(profiles))for(const [path,status,type] of [
 ['/',200,'text/html'],['/'+slug,200,'text/html'],['/'+slug+'/',308,''],['/api/locale',200,'application/json'],['/api/content',200,'application/json'],['/api/invitation/'+slug,200,'application/json'],['/admin',200,'text/html'],['/api/admin/session',401,'application/json'],['/api/does-not-exist',404,'application/json']
]){
 try{const result=await probe(path,agent,status,type);failed||=!result.passed;console.log(JSON.stringify({profile,...result}));}
 catch{failed=true;console.log(JSON.stringify({profile,path,passed:false,error:'request_failed_or_timed_out'}));}
}
process.exitCode=failed?1:0;
