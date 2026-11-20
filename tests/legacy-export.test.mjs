import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {legacyMediaExport} from '../scripts/legacy-media-export.js';
test('legacy media export requires both a signed owner cookie and a temporary random capability',async()=>{
 const token='1'.repeat(64),tokenHash=createHash('sha256').update(token).digest('hex');let calls=0;
 const handler=legacyMediaExport({expiresAt:Date.now()+60000,tokenHash,adminCookie:async r=>r.headers.get('cookie')==='signed-owner'});
 const env={BUCKET:{list:async()=>{calls++;return {objects:[{key:'gift-proofs/private.pdf',size:4,etag:'abcd',httpMetadata:{contentType:'application/pdf'}}],truncated:false};},get:async()=>({body:'test',size:4,httpEtag:'"abcd"',httpMetadata:{contentType:'application/pdf'}})}};
 const call=(path='/api/admin/migration-media',headers={})=>handler(new Request('https://legacy.test'+path,{headers}),env);
 for(const headers of [{},{Cookie:'signed-owner'},{'x-wedding-export-token':token},{'x-wedding-export-token':'2'.repeat(64),Cookie:'signed-owner'}])assert.equal((await call(undefined,headers)).status,401);
 assert.equal(calls,0);const headers={'x-wedding-export-token':token,Cookie:'signed-owner'};
 const result=await call(undefined,headers);assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);assert.equal((await result.json()).objects[0].key,'gift-proofs/private.pdf');
 const object=await call('/api/admin/migration-media/object?key=gift-proofs%2Fprivate.pdf',headers);assert.equal(await object.text(),'test');assert.equal(object.headers.get('etag'),'"abcd"');
 assert.equal((await handler(new Request('https://legacy.test/api/admin/migration-media',{headers}),{...env,RUNTIME:'vercel'})).status,404);
 const expired=legacyMediaExport({expiresAt:0,tokenHash,adminCookie:async()=>true});assert.equal((await expired(new Request('https://legacy.test/api/admin/migration-media',{headers}),env)).status,404);
});
