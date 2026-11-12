import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const data = await mkdtemp(tmpdir()+'/javor-prelaunch-');
const child=spawn(process.execPath,['production/server.mjs'],{env:{...process.env,APP_ENV:'prelaunch',DEMO_MODE:'false',SEED_DEMO:'false',RENDER:'true',PORT:'5193',DATA_DIR:data},stdio:['ignore','pipe','pipe']});
try{
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error(output)),10000);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('"event":"ready"')){clearTimeout(timer);resolve();}});child.stderr.on('data',chunk=>output+=chunk);child.on('exit',code=>{clearTimeout(timer);reject(new Error(`${code}: ${output}`));});});
  const get=(p,options={})=>fetch('http://127.0.0.1:5193'+p,{redirect:'manual',...options});
  assert.deepEqual(await (await get('/health')).json(),{ok:true,mode:'prelaunch',clientAccess:false});
  const html=await (await get('/login')).text();
  assert.ok(html.includes('<fieldset disabled>'));
  assert.ok(!/Demo2026|@demo|fictional|fiktivní/.test(html));
  for(const p of ['/api/app','/api/files?id=file-item-balls','/account','/forgot-password','/native/public-demo/app.sqlite'])assert.equal((await get(p,{headers:{Cookie:'dotace_session=old-public-session'}})).status,503);
  assert.equal((await get('/auth/login',{method:'POST',body:new URLSearchParams({email:'federation@demo.javor.example',password:'FederationDemo2026!'})})).status,503);
  const logout=await get('/logout');assert.equal(logout.status,303);assert.equal(logout.headers.getSetCookie().length,3);
  assert.deepEqual(await readdir(data),[]);
  console.log('PASS: prelaunch exposes only the entry page, rejects old accounts and private routes, and never opens data');
}finally{child.kill('SIGTERM');await once(child,'exit');await rm(data,{recursive:true,force:true});}
