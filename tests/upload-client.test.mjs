import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
const source=await readFile('public/upload.js','utf8');
function fixture(url){const requests=[],context={window:{},location:{hostname:'preview.vercel.app'},URL,fetch:async(path,options)=>{requests.push({path:String(path),options});return Response.json(requests.length===1?{url,ticket:'synthetic-ticket'}:requests.length===2?{}:{src:'/media/synthetic.jpg'});}};runInNewContext(source,context);return {requests,upload:()=>context.window.uploadWeddingFile({name:'photo.jpg',type:'image/jpeg',size:5000000},{kind:'photo'})};}
test('browser direct uploads accept isolated QA and production staging without sending cookies',async()=>{
 for(const bucket of ['wedding-staging','wedding-qa-staging']){
  const f=fixture('https://lgwrwymrjcptoztjvbxz.supabase.co/storage/v1/object/upload/sign/'+bucket+'/staging/photos/'+'a'.repeat(36)+'.jpg?token=synthetic');
  assert.equal((await f.upload()).src,'/media/synthetic.jpg');assert.equal(f.requests[1].options.method,'PUT');assert.equal(f.requests[1].options.credentials,'omit');assert.equal(f.requests[1].options.redirect,'error');assert.equal(f.requests[2].path,'/api/uploads/complete');
 }
});
test('browser refuses other projects, non-staging buckets and signed URLs without a token',async()=>{
 for(const url of ['https://other.supabase.co/storage/v1/object/upload/sign/wedding-staging/staging/photos/'+'a'.repeat(36)+'.jpg?token=bad','https://lgwrwymrjcptoztjvbxz.supabase.co/storage/v1/object/upload/sign/wedding-private/gift-proofs/'+'a'.repeat(36)+'.jpg?token=bad','https://lgwrwymrjcptoztjvbxz.supabase.co/storage/v1/object/upload/sign/wedding-staging/staging/photos/'+'a'.repeat(36)+'.jpg']){const f=fixture(url);await assert.rejects(f.upload(),/Tujuan/);assert.equal(f.requests.length,1);}
});
