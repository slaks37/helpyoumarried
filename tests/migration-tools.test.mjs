import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {classifyObject,parseList,requiredMedia} from '../scripts/migrate-media.mjs';
import {verifyBackup} from '../scripts/verify-backup.mjs';
test('media inventory follows pagination and keeps every unknown object private',()=>{
 const result=parseList('<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b</NextContinuationToken><Contents><Key>gift-proofs/test.pdf</Key><Size>123</Size><ETag>&quot;etag&quot;</ETag></Contents></ListBucketResult>');
 assert.equal(result.cursor,'a&b');assert.equal(result.objects[0].size,123);assert.equal(result.objects[0].etag,'"etag"');assert.equal(result.truncated,true);
 assert.equal(classifyObject('00000000-0000-4000-a000-000000000001.jpg').bucket,'wedding-gallery');
 assert.equal(classifyObject('gift-proofs/00000000-0000-4000-a000-000000000001.pdf').bucket,'wedding-private');assert.equal(classifyObject('old/unknown.mp3').bucket,'wedding-archive');
 const b={rows:{'public.settings':[JSON.stringify({value:'{"src":"/media/00000000-0000-4000-a000-000000000001.jpg"}'})],'public.gifts':[JSON.stringify({proof_key:'gift-proofs/private.pdf'})]}};assert.equal(requiredMedia(b).size,2);
});
test('backup verification checks every checksum and restores rows with foreign keys enabled',async()=>{
 const row=JSON.stringify({key:'test-setting',value:'unchanged',updated_at:'2026-10-30T00:00:00Z'}),digest=createHash('md5').update(row).digest('hex');
 const b={schema:[{schema:'public',name:'settings',columns:['key','value','updated_at']}],baseline:[{name:'public.settings',count:1,digest}],rows:{'public.settings':[row]}};
 assert.deepEqual(await verifyBackup(b),{tables:1,records:1,checksumsVerified:true,isolatedRestoreVerified:true});b.rows['public.settings'][0]=row.replace('unchanged','tampered');await assert.rejects(()=>verifyBackup(b),/checksum mismatch/);
});
