import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

const data = await mkdtemp(tmpdir() + '/dotace-public-demo-');
const origin = 'http://127.0.0.1:5190';
const privatePassword = 'fixture-only-private-password-123456';
let child;
async function start(demo) {
  child = spawn(process.execPath, ['render/server.mjs'], {
    env: { ...process.env, DEMO_MODE: String(demo), ADMIN_EMAIL: 'admin@javor.example',
      ADMIN_PASSWORD: demo ? '' : privatePassword, DATA_DIR: data, PORT: '5190',
      RENDER_EXTERNAL_URL: origin, OPENAI_API_KEY: demo ? 'fixture-must-never-be-used' : '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Gateway startup timed out: ' + output)), 15000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('gateway ready')) { clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Gateway exited ${code}: ${output}`)); });
  });
}
async function stop() { child.kill('SIGTERM'); await once(child, 'exit'); }
async function state(cookie = '') {
  const response = await fetch(origin + '/api/app', { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return response.json();
}
async function command(action, payload, cookie = '', expected = 200) {
  const response = await fetch(origin + '/api/app', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
    body: JSON.stringify({ action, payload }) });
  assert.equal(response.status, expected, await response.clone().text());
  return response.json();
}
try {
  await start(false);
  const login = await fetch(origin + '/auth/login', { method: 'POST', redirect: 'manual',
    body: new URLSearchParams({ email: 'admin@javor.example', password: privatePassword }) });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const privateState = await state(cookie);
  const contract = privateState.contracts.find(c => c.status === 'draft');
  const privateContract = await command('saveContract', { contract: { ...contract, id: '', number: 'PRIVATE-ONLY-RECORD', version: 0 } }, cookie);
  await stop();

  await start(true);
  assert.equal((await fetch(origin, { redirect: 'manual' })).status, 200);
  const demo = await state();
  assert.equal(demo.capabilities.demo, true);
  assert.equal(demo.user.displayName, 'Demo');
  assert.equal(demo.membership.role, 'federation');
  assert.equal(demo.contracts.length, 4);
  assert.ok(!demo.contracts.some(c => c.id === privateContract.id));
  assert.ok(!demo.capabilities.extraction.includes('AI +'));
  assert.ok(!demo.capabilities.adviser.startsWith('AI '));
  const forged = await (await fetch(origin + '/api/app', { headers: { Cookie: cookie,
    'oai-authenticated-user-id': privateState.user.userId,
    'oai-authenticated-user-email': privateState.user.email } })).json();
  assert.equal(forged.user.email, 'demo@javor.example');
  assert.ok(!forged.contracts.some(c => c.id === privateContract.id));
  console.log('PASS: anonymous demo uses isolated fictional data and ignores credentials, forged identity and paid AI keys');

  for (const route of ['/login', '/signin-with-chatgpt', '/signout-with-chatgpt', '/auth/register']) {
    const response = await fetch(origin + route, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
  }
  await command('invite', { organizationId: demo.organizations[0].id, email: 'fixture@example.com', role: 'member' }, '', 403);
  await command('acceptInvite', { token: 'fixture' }, '', 403);
  const foreignOrigin = await fetch(origin + '/api/app', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' },
    body: JSON.stringify({ action: 'feedback', payload: { text: 'Must not save' } }) });
  assert.equal(foreignOrigin.status, 403);
  console.log('PASS: login routes return to the demo; account invitations and cross-origin writes remain blocked');

  const original = demo.files.find(f => f.kind === 'receipt' && f.contractId === 'contract-haj');
  const originalResponse = await fetch(origin + '/api/files?id=' + original.id);
  assert.equal(originalResponse.status, 200);
  const originalBytes = await originalResponse.arrayBuffer();
  const body = new FormData();
  body.set('file', new Blob([originalBytes], { type: 'application/pdf' }), 'FICTIONAL-public-demo-test.pdf');
  body.set('contractId', 'contract-haj');
  body.set('kind', 'receipt');
  const uploaded = await fetch(origin + '/api/files', { method: 'POST', body, headers: { Origin: origin } });
  assert.equal(uploaded.status, 200);
  const file = (await uploaded.json()).file;
  const source = demo.items.find(i => i.contractId === 'contract-haj');
  const item = { ...source, id: '', number: 'PUBLIC-DEMO-TEST', version: 0, fileIds: [file.id], orgReview: 'unchecked' };
  const saved = await command('saveItem', { item });
  await command('saveItem', { item: { ...item, number: 'INVALID-TEST', amount: -1 } }, '', 400);
  console.log('PASS: anonymous originals, PDF upload and expense save work; invalid amounts remain rejected');

  await stop();
  await start(true);
  assert.ok((await state()).items.some(i => i.id === saved.id));
  const restored = await fetch(origin + '/api/files?id=' + file.id);
  assert.equal(restored.status, 200);
  assert.deepEqual(Buffer.from(await restored.arrayBuffer()), Buffer.from(originalBytes));
  console.log('PASS: demo expense and original file survive a restart');

  await stop();
  await start(false);
  assert.equal((await fetch(origin + '/api/app')).status, 401);
  const privateRestored = await state(cookie);
  assert.equal(privateRestored.capabilities.demo, false);
  assert.ok(privateRestored.contracts.some(c => c.id === privateContract.id));
  assert.ok(!privateRestored.items.some(i => i.id === saved.id));
  assert.equal((await fetch(origin + '/api/files?id=' + file.id, { headers: { Cookie: cookie } })).status, 404);
  console.log('PASS: switching back restores protected data and sessions without mixing in public demo records');
} finally {
  if (child?.exitCode === null) await stop();
  await rm(data, { recursive: true, force: true });
}
