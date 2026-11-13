import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const image=process.argv[2]||'dotace-ci';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
for(const mode of ['prelaunch','demo']){
 const name=`javor-container-qa-${process.pid}-${mode}`;
 try{
  docker('run','-d','--name',name,'--cap-drop=KILL','-p','127.0.0.1::10000','-e',`APP_ENV=${mode}`,'-e',`DEMO_MODE=${mode==='demo'}`,image);
  const address=docker('port',name,'10000/tcp');const base=`http://${address}`;
  let ready=false;
  for(let n=0;n<40;n++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert.ok(ready,docker('logs',name));
  const page=await fetch(base+'/login');assert.equal(page.status,200);
  const html=await page.text();assert.ok(html.includes('login-shell'));
  assert.equal((await fetch(base+'/account.css')).status,200);
  if(mode==='demo'){
   const login=await fetch(base+'/auth/login',{redirect:'manual',method:'POST',headers:{Origin:'http://localhost:10000'},body:new URLSearchParams({email:'federation',password:'federation'})});
   assert.equal(login.status,303,await login.text());
  }else assert.ok(html.includes('<fieldset disabled>'));
  docker('stop','--time','5',name);
  assert.equal(docker('inspect','--format','{{.State.ExitCode}}',name),'0');
  assert.ok(!docker('logs',name).includes('FATAL'));
  console.log(`PASS: ${mode} container serves assets and stops cleanly without CAP_KILL`);
 }finally{docker('rm','-f',name);}
}
