import postgres from 'npm:postgres@3.4.3';
import {ALLOWED_SQL} from './allowlist.ts';
import {credentialScope,scopedSql} from './scopes.js';
import {executeBatch,WriteConflict} from './transaction.js';

const connectionString=Deno.env.get('SUPABASE_DB_URL');
if(!connectionString)throw new Error('SUPABASE_DB_URL is unavailable');

type Operation={sql:string;args:Array<string|number|boolean|null>;mode:'first'|'all'|'run'};

function error(status:number,message:string){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});}
function hex(bytes:Uint8Array){return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}

async function authenticated(request:Request,sql:postgres.Sql){
 const token=request.headers.get('x-wedding-db-token');
 if(!token||!(/^[a-f0-9]{64}$/.test(token)))return false;
 const hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
 const rows=await sql`select name,token_hash from wedding_internal.api_tokens where name in ('sites-worker','vercel-runtime','vercel-preview')`;
 return credentialScope(rows,hash);
}

function validatedOperations(value:unknown):Operation[]{
 if(!value||typeof value!=='object'||!Array.isArray((value as {operations?:unknown}).operations))throw new Error('Invalid operations');
 const operations=(value as {operations:unknown[]}).operations;
 if(operations.length<1||operations.length>50)throw new Error('Invalid batch size');
 return operations.map(item=>{
  if(!item||typeof item!=='object')throw new Error('Invalid operation');
  const operation=item as Operation;
  if(typeof operation.sql!=='string'||!ALLOWED_SQL.has(operation.sql))throw new Error('SQL operation is not allowed');
  if(!['first','all','run'].includes(operation.mode)||!Array.isArray(operation.args)||operation.args.length>24||operation.args.some(arg=>arg!==null&&!['string','number','boolean'].includes(typeof arg)))throw new Error('Invalid parameters');
  if((operation.sql.match(/\?/g)||[]).length!==operation.args.length)throw new Error('Parameter count mismatch');
  return operation;
 });
}

async function executeOperation(client:postgres.Sql,operation:Operation,scope:string){
 let index=0;
 const query=scopedSql(operation.sql,scope).replace(/\?/g,()=>`$${++index}`);
 const rows=await client.unsafe(query,operation.args,{prepare:false});
 return {rows:[...rows],count:rows.count};
}

Deno.serve(async request=>{
 if(request.method!=='POST')return error(405,'Method not allowed');
 if(Number(request.headers.get('content-length')||0)>40000)return error(413,'Request too large');
 // Edge isolates multiply global pools. Keep one connection for this request and
 // release it on every exit path, including rejected auth and failed transactions.
 const sql=postgres(connectionString,{prepare:false,max:1,idle_timeout:2,connect_timeout:10,
  connection:{application_name:'wedding-db'}});
 try{
  const scope=await authenticated(request,sql);if(!scope)return error(401,'Unauthorized');
  const raw=await request.text();
  if(raw.length>40000)return error(413,'Request too large');
  const operations=validatedOperations(JSON.parse(raw));
  const results=await sql.begin(transaction=>executeBatch(transaction,operations,scope,executeOperation));
  return Response.json({results},{headers:{'Cache-Control':'no-store'}});
 }catch(reason){
  if(reason instanceof WriteConflict)return error(409,'Data changed; reload RSVP and seating before retrying');
  if(reason instanceof SyntaxError||reason instanceof Error&&/^(Invalid|SQL operation|Parameter count)/.test(reason.message))return error(400,reason.message);
  console.error('Wedding database request failed',reason instanceof Error?reason.message:String(reason));
  return error(503,'Database operation failed');
 }finally{
  await sql.end({timeout:1}).catch(()=>console.error('Wedding database connection cleanup failed'));
 }
});
