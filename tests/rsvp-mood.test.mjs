import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {GET as localeFromVercel} from '../api/locale.js';

test('Vercel locale uses the visitor country rather than the origin server',async()=>{
 for(const [country,language] of [['ID','id'],['US','en'],['SG','en'],[null,'id']]){
  const headers=country?{'x-vercel-ip-country':country}:{};
  const response=localeFromVercel(new Request('https://stefen-jessica-forever.site/api/locale',{headers}));
  assert.equal((await response.json()).language,language);
  assert.match(response.headers.get('cache-control'),/no-store/);
 }
});

test('saved RSVP chooses a persistent mood and confirmation opens the matching message',async()=>{
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,dataset:{},style:{setProperty(){}},children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);},addEventListener(){},setAttribute(key,value){this[key]=value;},focus(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const document={body:{dataset:{}},querySelector:node,createElement:()=>({style:{setProperty(){}}})};
 const context={document,window:{matchMedia:()=>({matches:false,addEventListener(){}})}};
 runInNewContext(await readFile('public/rsvp-mood.js','utf8'),context);
 const savedYes=[{status:'attending',event_id:'ceremony'}];
 context.window.setWeddingMood(savedYes);
 assert.equal(document.body.dataset.rsvpMood,'happy');
 assert.equal(node('#rsvp-weather').children.length,38);
 assert.equal(node('#rsvp-result').open,undefined);
 context.window.setWeddingMood(savedYes,true);
 assert.equal(node('#rsvp-result').open,true);
 assert.equal(node('#rsvp-result-happy').hidden,false);
 assert.equal(node('#rsvp-result-sad').hidden,true);
 node('#rsvp-result').close();
 context.window.setWeddingMood([{status:'declined',event_id:'ceremony'}],true);
 assert.equal(document.body.dataset.rsvpMood,'sad');
 assert.equal(node('#rsvp-weather').children.length,34);
 assert.equal(node('#rsvp-result-happy').hidden,true);
 assert.equal(node('#rsvp-result-sad').hidden,false);
 node('#rsvp-result').close();
 context.window.setWeddingMood(savedYes);
 assert.equal(document.body.dataset.rsvpMood,'happy');
});
