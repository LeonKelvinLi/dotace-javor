import http from 'node:http';
import {readFileSync,mkdirSync,readdirSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {Readable} from 'node:stream';
const data=path.resolve(process.env.DATA_DIR||'.render-data');mkdirSync(data,{recursive:true,mode:0o700});
const adminEmail=(process.env.ADMIN_EMAIL||'admin@javor.example').toLowerCase();
if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<20)throw new Error('Set ADMIN_PASSWORD to a random secret of at least 20 characters.');
const auth=new DatabaseSync(path.join(data,'accounts.sqlite'));auth.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS accounts(email TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL)');
function passwordHash(password,salt){return scryptSync(password,salt,64).toString('hex')}
function addAccount(email,password){const salt=randomBytes(24).toString('hex');auth.prepare('INSERT INTO accounts VALUES (?,?,?)').run(email,salt,passwordHash(password,salt))}
if(!auth.prepare('SELECT email FROM accounts WHERE email=?').get(adminEmail))addAccount(adminEmail,process.env.ADMIN_PASSWORD);
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
const mf=new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:path.join(data,'worker-storage'),name:'dotace',modules:[{type:'ESModule',path:path.resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(f=>/\.m?js$/.test(f)&&f!=='index.js').map(f=>({type:'ESModule',path:path.resolve('dist/server',f)}))],modulesRoot:path.resolve('dist/server'),compatibilityDate:config.compatibility_date,compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'dotace'},d1Persist:path.join(data,'d1'),r2Buckets:['BUCKET'],r2Persist:path.join(data,'r2'),bindings:{...(process.env.OPENAI_API_KEY?{OPENAI_API_KEY:process.env.OPENAI_API_KEY}:{}),OPENAI_MODEL:process.env.OPENAI_MODEL||'gpt-5.4-mini'}}));
const db=await mf.getD1Database('DB');
await db.prepare('CREATE TABLE IF NOT EXISTS render_migrations(name TEXT PRIMARY KEY)').run();
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 if(await db.prepare('SELECT name FROM render_migrations WHERE name=?').bind(file).first())continue;
 const sql=readFileSync(path.join('drizzle',file),'utf8');
 await db.batch([...sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)),db.prepare('INSERT INTO render_migrations VALUES (?)').bind(file)]);
}
const identity=email=>({'oai-authenticated-user-id':`render:${email}`,'oai-authenticated-user-email':email});
// Pin the owner before opening the public listener. No first-visitor admin election.
const seed=await mf.dispatchFetch('http://localhost/api/app',{headers:identity(adminEmail)});if(!seed.ok)throw new Error(`Owner initialization failed (${seed.status}): ${await seed.text()}`);
const digest=s=>createHash('sha256').update(s).digest('hex');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function loginPage(error = '', invite = '') {
  const copy = (cs, en, tag = 'span') => `<${tag} data-cs="${escape(cs)}" data-en="${escape(en)}">${escape(cs)}</${tag}>`;
  const title = invite ? ['Vytvořit přístup', 'Create your account'] : ['Přihlášení', 'Sign in'];
  const errors = {
    'E-mail nebo heslo není správné.': 'The email or password is incorrect.',
    'Pozvánka není platná, účet již existuje nebo je heslo příliš krátké.': 'The invitation is invalid, an account already exists, or the password is too short.',
  };
  return `<!doctype html><html lang="cs" translate="no"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Dotace · Javor</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f2;color:#27343a;font:16px system-ui;display:grid;min-height:100vh;place-items:center}
main{width:min(420px,92vw);padding:32px;background:white;border:1px solid #d8dfd7;border-radius:6px}.login-brand{font-weight:750;letter-spacing:.08em;margin:24px 0;font-size:14px}
h1{font-size:28px;margin:0 0 8px}p{line-height:1.5;color:#54645b}label{display:block;font-size:14px;margin:20px 0 8px}input,button{width:100%;padding:13px;border:1px solid #cdd5ce;border-radius:4px;font:inherit}
button{margin-top:24px;background:#29363c;color:white;cursor:pointer}.error{color:#a13e34}small{display:block;margin-top:20px;color:#657168}.languages{display:flex;gap:8px;justify-content:flex-end}.languages button{width:auto;margin:0;padding:6px 9px;background:white;color:#27343a;font-size:12px}.languages button[aria-pressed=true]{background:#edf4ef;border-color:#7c9d8a}
</style><main><div class="languages" role="group" aria-label="Language / Jazyk"><button type="button" data-lang="cs" aria-pressed="true">Čeština</button><button type="button" data-lang="en" aria-pressed="false">English</button></div>
<div class="login-brand">JAVOR</div>${copy(...title, 'h1')}
${copy(invite ? 'Přijměte pozvánku a nastavte si heslo.' : 'Přihlaste se e-mailem a heslem svého účtu.', invite ? 'Accept your invitation and choose a password.' : 'Use your account email and password.', 'p')}
${error ? `<p class="error" role="alert">${copy(error, errors[error] || error)}</p>` : ''}
<form method="post" action="/auth/${invite ? 'register' : 'login'}">
<input type="hidden" name="invite" value="${escape(invite)}"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">${copy(invite ? 'Heslo (alespoň 12 znaků)' : 'Heslo', invite ? 'Password (at least 12 characters)' : 'Password')}</label>
<input id="password" name="password" type="password" autocomplete="${invite ? 'new-password' : 'current-password'}" minlength="${invite ? '12' : '1'}" maxlength="256" required>
<button>${copy(invite ? 'Vytvořit přístup' : 'Přihlásit se', invite ? 'Create account' : 'Sign in')}</button></form>
${copy('Přístup vám poskytne správce federace nebo vaší organizace.', 'Your federation or organization administrator can invite you.', 'small')}
<script>
function chooseLanguage(language) {
 document.documentElement.lang = language;
 document.querySelectorAll('[data-cs]').forEach(element => { element.textContent = element.dataset[language]; });
 document.querySelectorAll('[data-lang]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.lang === language)); });
 try { localStorage.setItem('dotace-language', language); } catch {}
}
document.querySelectorAll('[data-lang]').forEach(button => { button.addEventListener('click', () => chooseLanguage(button.dataset.lang)); });
try { if (localStorage.getItem('dotace-language') === 'en') chooseLanguage('en'); } catch {}
</script></main></html>`;
}

const attempts=new Map();
const server=http.createServer(async(req,res)=>{try{
 const origin=process.env.RENDER_EXTERNAL_URL||`http://${req.headers.host}`;const url=new URL(req.url,origin);
 const redirect=(target,cookie)=>{res.writeHead(303,{Location:target,...(cookie?{'Set-Cookie':cookie}:{})});res.end()};
 if(url.pathname==='/health'){await db.prepare('SELECT 1').first();res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
 const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('dotace_session='))?.slice(15);
 const session=token?auth.prepare('SELECT email FROM sessions WHERE token=? AND expires>?').get(digest(token),Date.now()):null;
 const secure=origin.startsWith('https:')?'; Secure':'';
 if(url.pathname==='/signout-with-chatgpt'){if(token)auth.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));return redirect('/login',`dotace_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)}
 if(['/login','/signin-with-chatgpt'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(loginPage('',url.searchParams.get('invite')||''))}
 if(url.pathname.startsWith('/auth/')&&req.method==='POST'){
  if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);return res.end('Invalid origin')}
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim();const recent=attempts.get(ip)||{count:0,at:Date.now()};if(Date.now()-recent.at>600000){recent.count=0;recent.at=Date.now()}if(++recent.count>20){res.writeHead(429);return res.end('Too many attempts. Try later.')}if(attempts.size>5000)attempts.clear();attempts.set(ip,recent);
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12000){res.writeHead(413);return res.end('Too large')}chunks.push(chunk)}
  const fields=new URLSearchParams(Buffer.concat(chunks).toString());const email=(fields.get('email')||'').trim().toLowerCase(),password=fields.get('password')||'',invite=fields.get('invite')||'';
  let account=auth.prepare('SELECT * FROM accounts WHERE email=?').get(email);
  if(url.pathname==='/auth/register'){
   const invitation=await db.prepare('SELECT email,expires_at,used_by FROM invitations WHERE token_hash=?').bind(digest(invite)).first();
   if(account||!invitation||invitation.email!==email||invitation.used_by||invitation.expires_at<new Date().toISOString()||password.length<12||password.length>256){res.writeHead(400,{'Content-Type':'text/html; charset=utf-8'});return res.end(loginPage('Pozvánka není platná, účet již existuje nebo je heslo příliš krátké.',invite))}
   addAccount(email,password);account=auth.prepare('SELECT * FROM accounts WHERE email=?').get(email);
  }
  if(!account||password.length>256||!timingSafeEqual(Buffer.from(account.hash,'hex'),Buffer.from(passwordHash(password,account.salt),'hex'))){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});return res.end(loginPage('E-mail nebo heslo není správné.'))}
  attempts.delete(ip);auth.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const raw=randomBytes(32).toString('hex');auth.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(raw),email,Date.now()+8*3600000);
  return redirect(invite?`/?invite=${encodeURIComponent(invite)}`:'/',`dotace_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`);
 }
 if(!session){if(url.pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});return res.end('{"error":"Přihlaste se."}')}return redirect(`/login${url.searchParams.get('invite')?'?invite='+encodeURIComponent(url.searchParams.get('invite')):''}`)}
 const staticRoot=path.resolve('dist/client');const staticPath=path.resolve(staticRoot,'.'+decodeURIComponent(url.pathname));if(req.method==='GET'&&staticPath.startsWith(staticRoot+path.sep)&&existsSync(staticPath)&&statSync(staticPath).isFile()){const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.gz':'application/gzip','.txt':'text/plain','.wasm':'application/wasm'};res.writeHead(200,{'Content-Type':mime[path.extname(staticPath)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});return res.end(readFileSync(staticPath))}
 const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(!key.toLowerCase().startsWith('oai-')&&!['host','connection','cookie','content-length','transfer-encoding','accept-encoding'].includes(key.toLowerCase())&&typeof value==='string')headers.set(key,value)}for(const [key,value]of Object.entries(identity(session.email)))headers.set(key,value);
 const bodyParts=[];let bodySize=0;for await(const chunk of req){bodySize+=chunk.length;if(bodySize>16*1024*1024){res.writeHead(413);return res.end('Too large')}bodyParts.push(chunk)}
 const response=await mf.dispatchFetch(url.toString(),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(bodyParts)}:{})});
 const responseHeaders=Object.fromEntries(response.headers);delete responseHeaders['content-encoding'];delete responseHeaders['content-length'];responseHeaders['Cache-Control']='private, no-store';res.writeHead(response.status,responseHeaders);if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch(error){console.error('Render request failed:',error.message);if(!res.headersSent)res.writeHead(500);res.end('Request failed.');}});
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Dotace Render gateway ready'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await mf.dispose();auth.close();process.exit(0)}));
