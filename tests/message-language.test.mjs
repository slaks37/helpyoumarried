import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeGuestMessage} from '../worker/message-language.js';
test('multilingual review keeps original meaning and returns both translations',async()=>{
 const previous=globalThis.fetch;let request;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');request=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({safe:true,language:'fr',indonesian:'Selamat menempuh hidup baru!',english:'Congratulations on your wedding!'})}}]});};
 try{const result=await analyzeGuestMessage('Félicitations pour votre mariage!',{OPENAI_API_KEY:'test-key'},'Marie');assert.equal(result.status,'published');assert.equal(result.language,'fr');assert.equal(result.translationId,'Selamat menempuh hidup baru!');assert.equal(request.store,false);assert.deepEqual(JSON.parse(request.messages[1].content),{author:'Marie',message:'Félicitations pour votre mariage!'});}finally{globalThis.fetch=previous;}
});
test('missing credentials, invalid review and service failure never publish a message',async()=>{
 assert.equal((await analyzeGuestMessage('Happy wedding!',{})).status,'pending');
 const previous=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"safe":true}'}}]});assert.equal((await analyzeGuestMessage('Happy wedding!',{OPENAI_API_KEY:'test'})).status,'pending');globalThis.fetch=async()=>{throw new Error('offline');};assert.equal((await analyzeGuestMessage('Happy wedding!',{OPENAI_API_KEY:'test'})).status,'pending');assert.equal((await analyzeGuestMessage('Hello',{},'fuck you')).status,'held');}finally{globalThis.fetch=previous;}
});
