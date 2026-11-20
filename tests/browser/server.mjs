import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {runtime} from '../support/runtime.mjs';
const base='http://127.0.0.1:4175',s=await runtime({base,pageRoot:'dist/server-assets'}),admin=await s.login();
const created=await s.call('/api/admin/invitations',{method:'POST',headers:admin,body:{guestName:'Nina & Owen',slug:'qa-nina-owen',seats:4,eventIds:['reception'],salutation:'bapak_ibu',receptionTable:'Galilea-1'}}),fixture=await created.json();
const root=path.resolve('dist/client'),mime={'.js':'text/javascript','.css':'text/css','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:4175'){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,base);
  if(url.pathname==='/__qa/state'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({link:fixture.sharePath,responses:s.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM responses').get().n,status:s.DB.sqlite.prepare('SELECT status FROM responses').get()?.status}));return;}
  const ext=path.extname(url.pathname);if(mime[ext]){
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
   try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[ext]});res.end(bytes);return;}catch{res.writeHead(404);res.end();return;}
  }
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await s.handle(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}));
  const headers=Object.fromEntries(response.headers);if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie();
  res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Fixture error');}
});
server.listen(4175,'127.0.0.1',()=>console.log('Isolated Vercel-adapter browser fixture ready on 4175'));
process.on('SIGTERM',()=>server.close(async()=>{await s.close();process.exit(0);}));
