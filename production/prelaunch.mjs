// Closed entry page while the client services await configuration. This mode
// deliberately never opens a database, storage bucket or identity provider.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {loginPage} from './login-page.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = (cs,en) => `<span data-cs="${escape(cs)}" data-en="${escape(en)}">${escape(cs)}</span>`;
const page = loginPage({copy,escape,next:'/',email:'',available:false});
const assets = new Map(await Promise.all(['account.css','account.js'].map(async name => ['/'+name, await readFile(new URL('../public/'+name, import.meta.url))])));
const server = http.createServer((req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  let url;
  try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  const read = req.method === 'GET' || req.method === 'HEAD';
  const send = (status,type,body) => {res.writeHead(status,{'Content-Type':type});res.end(req.method === 'HEAD'?'':body);};
  if(read && url.pathname === '/health')return send(200,'application/json',JSON.stringify({ok:true,mode:'prelaunch',clientAccess:false}));
  if(read && assets.has(url.pathname))return send(200,url.pathname.endsWith('.js')?'application/javascript':'text/css',assets.get(url.pathname));
  if(read && ['/logout','/signout-with-chatgpt'].includes(url.pathname)){
    res.setHeader('Set-Cookie',['dotace_session','dotace_access','dotace_refresh'].map(name=>`${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.RENDER?'; Secure':''}`));
    res.writeHead(303,{Location:'/login'});return res.end();
  }
  if(read && url.pathname === '/login')return send(200,'text/html; charset=utf-8',page);
  if(read && url.pathname === '/') {res.writeHead(303,{Location:'/login'});return res.end();}
  req.resume();
  send(503,'application/json; charset=utf-8',JSON.stringify({error:'Workspace access is not activated yet.'}));
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log(JSON.stringify({event:'ready',mode:'prelaunch'})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
