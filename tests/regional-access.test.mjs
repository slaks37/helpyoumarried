import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDiagnostic,sanitizeMeasurement} from '../scripts/regional-access.mjs';
test('regional diagnostics cannot submit guest paths, queries, cookies or arbitrary hosts',()=>{
 const spec={target:'stefen-jessica-forever.site',type:'http',measurementOptions:{request:{method:'GET',path:'/api/locale'}}};
 assert.equal(validateDiagnostic(spec),spec);
 for(const request of [{method:'GET',path:'/qa-forbidden-guest'},{method:'GET',path:'/',query:'key=confidential'},{method:'GET',path:'/',headers:{Cookie:'private'}},{method:'POST',path:'/api/content'}])assert.throws(()=>validateDiagnostic({...spec,measurementOptions:{request}}));
 assert.throws(()=>validateDiagnostic({...spec,target:'example.org'}));
});
test('regional evidence omits raw bodies, cookies and probe IPs while retaining failure-stage metadata',()=>{
 const safe=sanitizeMeasurement({id:'fixture',type:'http',target:'stefen-jessica-forever.site',results:[{probe:{country:'KH',city:'Phnom Penh',ip:'private-address',asn:1,tags:['eyeball-network','u-owner']},result:{status:'finished',statusCode:403,rawBody:'Sorry, you have been blocked confidential',headers:{'set-cookie':'private-cookie',location:'/secret?key=private-token','cf-ray':'fixture-ray','content-type':'text/html'},tls:{authorized:true,protocol:'TLSv1.3'}}}]});
 const text=JSON.stringify(safe);for(const secret of ['private-address','private-cookie','private-token','confidential','u-owner'])assert.ok(!text.includes(secret));
 assert.equal(safe.results[0].blocked,true);assert.equal(safe.results[0].tls.authorized,true);assert.equal(safe.results[0].redirect.queryPresent,true);
});
