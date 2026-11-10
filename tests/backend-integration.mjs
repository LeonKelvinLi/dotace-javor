/**
 * Integration tests against the actual exported application commands.
 * Run: node tests/backend-integration.mjs (Node >=22.13).
 *
 * Node's SQLite engine executes the production migration and every production
 * SQL statement. The small D1/R2 adapters below replace external bindings only;
 * authorization, validation, transitions, persistence, and audit code are the
 * production implementation. Actual Worker deployment is checked separately.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const sqlite = new DatabaseSync(':memory:');
const objects = new Map();
let signedInUser = null;
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    function prepared(values = []) {
      return {
        bind(...args) { return prepared(args); },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
      };
    }
    return prepared();
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
const bucket = {
  async put(key, value) { objects.set(key, new Uint8Array(value)); },
  async get(key) {
    const value = objects.get(key);
    return value ? { body: value, size: value.length } : null;
  },
  async delete(key) { objects.delete(key); },
};
const bindings = { DB: db, BUCKET: bucket };
const loaded = new Map();
function loadApplicationModule(name) {
  if (loaded.has(name)) return loaded.get(name);
  assert.ok(['server', 'model', 'seed', 'autofill'].includes(name), `Unexpected application import: ${name}`);
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(readFileSync(path.join(root, 'lib', `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (specifier) => {
    if (specifier === 'cloudflare:workers') return { env: bindings };
    if (specifier === '@/app/chatgpt-auth') return { getChatGPTUser: async () => signedInUser };
    assert.ok(specifier.startsWith('./'), `Unexpected dependency: ${specifier}`);
    return loadApplicationModule(specifier.slice(2));
  };
  // Only repository-owned source is compiled; document content is never executed.
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: `${name}.ts` })(require, compiledModule, compiledModule.exports);
  loaded.set(name, compiledModule.exports);
  return compiledModule.exports;
}
const server = loadApplicationModule('server');
const user = (userId, email) => ({ userId, email, displayName: userId, fullName: null });
async function rejectStatus(work, status) {
  await assert.rejects(work, error => error instanceof server.ApiError && error.status === status);
}
const passed = [];
async function check(name, work) { await work(); passed.push(name); console.log(`✓ ${name}`); }

try {
  const journal = JSON.parse(readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  for (const migration of journal.entries) sqlite.exec(readFileSync(path.join(root, 'drizzle', `${migration.tag}.sql`), 'utf8'));
  await check('anonymous access is rejected and first owner bootstraps exactly once', async () => {
    await rejectStatus(() => server.requireActor(), 401);
    signedInUser = user('owner', 'owner@example.test');
    const first = await server.identity();
    assert.equal(first.member.role, 'federation');
    const second = await server.identity();
    assert.equal(second.member.id, first.member.id);
    signedInUser = user('uninvited', 'uninvited@example.test');
    assert.equal((await server.identity()).member, null);
    await rejectStatus(() => server.requireActor(), 403);
  });
  signedInUser = user('owner', 'owner@example.test');
  const federation = await server.requireActor();
  const organization = { ...federation, user: user('haj-admin', 'haj@example.test'), member: { id: 'm-haj', userId: 'haj-admin', email: 'haj@example.test', name: 'Haj Admin', role: 'org_admin', organizationId: 'org-haj' } };
  const member = { ...organization, member: { ...organization.member, role: 'member' } };
  const otherOrganization = { ...organization, member: { ...organization.member, organizationId: 'org-lipa' } };
  let state = await server.readState(federation);
  await check('fictional seed is durable, idempotent, and backed by actual PDF bytes', async () => {
    assert.equal(state.organizations.length, 3); assert.equal(state.contracts.length, 4); assert.equal(state.items.length, 6);
    const file = await server.authorizeFile(organization, 'file-item-balls');
    const object = await bucket.get(file.key);
    assert.ok(object.size > 300); assert.equal(new TextDecoder().decode(object.body.slice(0, 5)), '%PDF-');
    assert.match(new TextDecoder().decode(object.body), /FIKTIVNI DOKLAD/);
    assert.equal((await server.readState(await server.requireActor())).items.length, 6);
  });
  await check('organization state and original documents enforce tenant isolation', async () => {
    const scoped = await server.readState(organization);
    assert.equal(scoped.organizations.length, 1);
    assert.ok(scoped.contracts.every(c => c.organizationId === 'org-haj'));
    assert.ok(scoped.files.every(f => f.organizationId === 'org-haj'));
    await rejectStatus(() => server.getContract(otherOrganization, 'contract-haj'), 403);
    await rejectStatus(() => server.authorizeFile(otherOrganization, 'file-item-balls'), 403);
  });
  const contract = state.contracts.find(c => c.id === 'contract-haj');
  const initial = state.items.find(i => i.id === 'item-balls');
  await check('server rejects invalid amounts, blank review comments, foreign files and another-company recipient', async () => {
    await rejectStatus(() => server.command(organization, 'saveItem', { item: { ...initial, claimed: 1.234 } }), 400);
    await rejectStatus(() => server.command(organization, 'saveItem', { item: { ...initial, orgReview: 'commented', comment: '' } }), 400);
    await rejectStatus(() => server.command(organization, 'saveItem', { item: { ...initial, fileIds: ['file-item-lipa'] } }), 400);
    await rejectStatus(() => server.command(organization, 'saveItem', { item: { ...initial, orgReview: 'checked', recipientType: 'other', comment: 'A comment cannot override this error.' } }), 400);
  });
  await check('duplicate receipt imports cannot create a second cost in the same contract', async () => {
    const before = (await server.readState(organization)).items.length;
    await rejectStatus(() => server.command(organization, 'saveItem', {item:{...initial,id:'',version:0,number:initial.number.toLowerCase(),supplier:initial.supplier.toUpperCase()}}),409);
    assert.equal((await server.readState(organization)).items.length,before);
  });
  await check('unchecked items and ordinary-member declarations cannot be submitted', async () => {
    await rejectStatus(() => server.command(organization, 'submit', { contractId: contract.id, version: contract.version, declaration: true }), 400);
    await rejectStatus(() => server.command(member, 'submit', { contractId: contract.id, version: contract.version, declaration: true }), 403);
  });
  await check('real uploads reject disguised content and can be retrieved by authorized members', async () => {
    await rejectStatus(() => server.saveFile(organization, contract.id, 'receipt', new File(['not-a-pdf'], 'pretend.pdf', { type: 'application/pdf' })), 400);
    await rejectStatus(() => server.saveFile(member, contract.id, 'contract', new File(['%PDF-1.4'], 'contract.pdf')), 403);
    const original = await bucket.get((await server.authorizeFile(organization, 'file-item-balls')).key);
    const upload = await server.saveFile(organization, contract.id, 'receipt', new File([original.body], 'uploaded-receipt.pdf', { type: 'application/pdf' }));
    assert.equal(upload.size, original.size); assert.match(upload.sha256, /^[a-f0-9]{64}$/);
    assert.equal((await server.authorizeFile(organization, upload.id)).file.contractId, contract.id);
    await rejectStatus(() => server.authorizeFile(otherOrganization, upload.id), 403);
  });
  for (const item of state.items.filter(i => i.contractId === contract.id)) {
    await server.command(organization, 'saveItem', { item: { ...item, orgReview: item.claimed < item.amount ? 'commented' : 'checked', comment: item.claimed < item.amount ? 'Část dokladu se vztahuje k jinému turnaji.' : '' } });
  }
  state = await server.readState(organization);
  const checked = state.items.find(i => i.id === initial.id);
  await check('stale item versions cannot overwrite reviewed data', async () => {
    await rejectStatus(() => server.command(organization, 'saveItem', { item: { ...checked, version: 1 } }), 409);
    assert.equal((await server.readState(organization)).items.find(i => i.id === initial.id).version, 2);
  });
  await server.command(organization, 'submit', { contractId: contract.id, version: contract.version, declaration: true });
  await check('submitted accounting is locked and organization cannot approve its own grant', async () => {
    await rejectStatus(() => server.command(organization, 'saveItem', { item: checked }), 409);
    await rejectStatus(() => server.command(organization, 'approve', { contractId: contract.id, version: 2, conclusion: 'Unauthorized', reduction: 0 }), 403);
    await rejectStatus(() => server.command(federation, 'approve', { contractId: contract.id, version: 2, conclusion: 'Premature', reduction: 0 }), 400);
  });
  await check('clarification responses preserve the request and answer in immutable history', async () => {
    await server.command(federation, 'reviewItem', { id: checked.id, version: checked.version, decision: 'supplement', reason: 'Potvrďte vztah výdaje k turnaji.' });
    await server.command(organization, 'reply', { itemId: checked.id, text: 'Výdaj se vztahuje k zářijovému turnaji.' });
    state = await server.readState(federation);
    assert.ok(state.audit.some(e => e.action === 'item.supplement' && e.detail.includes('Potvrďte')));
    assert.ok(state.audit.some(e => e.action === 'item.reply' && e.detail.includes('zářijovému')));
    assert.equal(state.items.find(i => i.id === checked.id).sfjDecision, 'pending');
    assert.equal(state.contracts.find(c => c.id === contract.id).status, 'submitted');
    assert.throws(() => sqlite.exec("UPDATE audit SET data='{}'"), /immutable/);
    assert.throws(() => sqlite.exec('DELETE FROM audit'), /immutable/);
  });
  await check('SFJ bulk review and final approval persist a locked conclusion', async () => {
    await server.command(federation, 'bulkAccept', { contractId: contract.id, ids: state.items.filter(i => i.contractId === contract.id).map(i => i.id) });
    await server.command(federation, 'approve', { contractId: contract.id, version: 2, conclusion: 'Formální kontrola dokončena.', reduction: 0 });
    const result = await server.readState(federation);
    assert.equal(result.contracts.find(c => c.id === contract.id).status, 'approved');
    await rejectStatus(() => server.command(federation, 'saveItem', { item: result.items.find(i => i.id === checked.id) }), 409);
    await rejectStatus(() => server.saveFile(organization, contract.id, 'receipt', new File(['%PDF-1.4'], 'late.pdf')), 409);
  });
  await check('rejected costs require a reason and a sufficient final reduction', async () => {
    const item = state.items.find(i => i.id === 'item-sever');
    await rejectStatus(() => server.command(federation, 'reviewItem', { id: item.id, version: item.version, decision: 'rejected', reason: '' }), 400);
    await server.command(federation, 'reviewItem', { id: item.id, version: item.version, decision: 'rejected', reason: 'Fiktivní náklad nesouvisí s účelem dotace.' });
    await rejectStatus(() => server.command(federation, 'approve', { contractId: 'contract-sever', version: 1, conclusion: 'Kontrola dokončena.', reduction: 0 }), 400);
    await server.command(federation, 'approve', { contractId: 'contract-sever', version: 1, conclusion: 'Kontrola dokončena.', reduction: item.claimed });
  });
  await check('invitation token is hashed, email-bound, expiring and single-use', async () => {
    const invitation = await server.command(federation, 'invite', { organizationId: 'org-sever', email: 'new@example.test', role: 'member' });
    const token = new URL(invitation.inviteUrl, 'https://app.test').searchParams.get('invite');
    const stored = sqlite.prepare('SELECT token_hash FROM invitations').get(); assert.notEqual(stored.token_hash, token);
    await rejectStatus(() => server.acceptInvite({ ...federation, user: user('wrong', 'wrong@example.test'), member: null }, token), 403);
    const invited = { ...federation, user: user('new', 'new@example.test'), member: null };
    await server.acceptInvite(invited, token);
    await rejectStatus(() => server.acceptInvite(invited, token), 400);
    signedInUser = invited.user;
    assert.equal((await server.requireActor()).member.organizationId, 'org-sever');
    signedInUser = federation.user;
    const expired = await server.command(federation, 'invite', { organizationId: 'org-sever', email: 'expired@example.test', role: 'member' });
    sqlite.prepare("UPDATE invitations SET expires_at='2000-01-01T00:00:00Z' WHERE email=?").run('expired@example.test');
    await rejectStatus(() => server.acceptInvite({ ...invited, user: user('expired', 'expired@example.test') }, expired.inviteUrl.split('=')[1]), 400);
  });
  await check('only SFJ can invite another federation reviewer and existing organization accounts cannot escalate', async () => {
    await rejectStatus(() => server.command(organization, 'invite', { organizationId: '', email: 'outsider@example.test', role: 'federation' }), 403);
    await rejectStatus(() => server.command(member, 'invite', { organizationId: '', email: 'outsider@example.test', role: 'federation' }), 403);
    await rejectStatus(() => server.command(member, 'invite', { organizationId: 'org-haj', email: 'outsider@example.test', role: 'member' }), 403);
    await rejectStatus(() => server.command(federation, 'invite', { organizationId: 'org-haj', email: 'staff@example.test', role: 'federation' }), 400);
    await rejectStatus(() => server.command(federation, 'invite', { organizationId: '', email: 'empty@example.test', role: 'org_admin' }), 400);
    const staff = await server.command(federation, 'invite', { organizationId: '', email: 'staff@example.test', role: 'federation' });
    const incoming = { ...federation, user: user('staff-two', 'staff@example.test'), member: null };
    await server.acceptInvite(incoming, staff.inviteUrl.split('=')[1]);
    signedInUser = incoming.user;
    const reviewer = await server.requireActor();
    assert.equal(reviewer.member.role, 'federation');
    assert.equal(reviewer.member.organizationId, '');
    assert.equal((await server.readState(reviewer)).organizations.length, 3);
    const forbiddenUpgrade = await server.command(federation, 'invite', { organizationId: '', email: organization.user.email, role: 'federation' });
    await rejectStatus(() => server.acceptInvite(organization, forbiddenUpgrade.inviteUrl.split('=')[1]), 409);
    assert.equal(organization.member.role, 'org_admin');
    signedInUser = federation.user;
  });
  console.log(`\nPASS ${passed.length} backend integration scenarios (actual commands + SQLite; no network or external accounts).`);
} finally {
  sqlite.close();
}
