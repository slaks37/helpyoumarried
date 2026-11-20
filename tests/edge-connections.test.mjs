import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {credentialScope,scopedSql} from '../supabase/functions/wedding-db/scopes.js';
import {executeBatch,WriteConflict} from '../supabase/functions/wedding-db/transaction.js';

const source=stripTypeScriptTypes((await readFile('supabase/functions/wedding-db/index.ts','utf8')).replace(/^import .*;\n/gm,''));
const token='a'.repeat(64);
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
function setup({authorized=true,fail=false}={}){
 let handler;const clients=[];
 const postgres=(url,options)=>{
  const client=async()=>authorized?[{name:'sites-worker',token_hash:hash}]:[];
  client.options=options;client.closed=0;client.executed=0;
  client.unsafe=async()=>{client.executed++;if(fail)throw new Error('simulated SQL failure');const rows=[{count:4}];rows.count=1;return rows;};
  client.begin=async callback=>callback(client);
  client.end=async()=>{client.closed++;};clients.push(client);return client;
 };
 runInNewContext(source,{postgres,credentialScope,scopedSql,executeBatch,WriteConflict,ALLOWED_SQL:new Set(['SELECT COUNT(*) AS count FROM invitations']),
  Deno:{env:{get:()=> 'postgres://local/test'},serve:callback=>{handler=callback;}},
  Response,crypto,TextEncoder,console:{error(){}}});
 const request=(operations=[{sql:'SELECT COUNT(*) AS count FROM invitations',args:[],mode:'first'}])=>handler(new Request('https://local.test',{method:'POST',headers:{'x-wedding-db-token':token,'Content-Type':'application/json'},body:JSON.stringify({operations})}));
 return {clients,request};
}
test('each completed database request closes its only connection, including concurrent calls',async()=>{
 const s=setup();const results=await Promise.all(Array.from({length:12},()=>s.request()));
 assert.ok(results.every(r=>r.status===200));assert.equal(s.clients.length,12);
 assert.ok(s.clients.every(c=>c.closed===1&&c.options.max===1&&c.options.connection.application_name==='wedding-db'));
 assert.equal((await results[0].json()).results[0].rows[0].count,4);
});
test('authentication, validation and SQL failures also release connections',async()=>{
 for(const [options,operations,status]of [
  [{authorized:false},undefined,401],
  [{},[{sql:'DROP TABLE invitations',args:[],mode:'run'}],400],
  [{fail:true},undefined,503],
 ]){
  const s=setup(options);assert.equal((await s.request(operations)).status,status);
  assert.equal(s.clients[0].closed,1);
  if(status!==503)assert.equal(s.clients[0].executed,0);
 }
});
