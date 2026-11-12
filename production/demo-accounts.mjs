// Public, fictional training accounts. These are never created in client production.
export const demoAccounts = [
  { key: "federation", email: "federation@demo.javor.example", password: "federation", name: "Kontrolor federace", role: "federation", organizationId: "" },
  { key: "organization", email: "organization@demo.javor.example", password: "organization", name: "Správce FK Háj", role: "org_admin", organizationId: "org-haj" },
];

export async function prepareDemoAccounts(db, auth, bucket, seedDemo) {
  const owner = demoAccounts[0];
  await db.prepare("INSERT OR IGNORE INTO bootstrap (id,owner_id,seeded) VALUES ('owner',?,0)").bind(`render:${owner.email}`).run();
  await seedDemo(db, bucket);
  const current=await db.prepare("SELECT value FROM runtime_meta WHERE key='demo_credentials'").first();
  const updateCredentials=current?.value!=="simple-role-logins-v1";
  for (const account of demoAccounts) {
    if (updateCredentials || !await db.prepare("SELECT email FROM app_accounts WHERE email=?").bind(account.email).first()) {
      await auth.addAccount(account.email, account.password, true);
      await db.prepare("DELETE FROM app_sessions WHERE email=?").bind(account.email).run();
    }
    const member = { id: `demo-member-${account.key}`, userId: `render:${account.email}`, email: account.email, name: account.name, role: account.role, organizationId: account.organizationId };
    await db.prepare("INSERT OR IGNORE INTO memberships (id,user_id,organization_id,role,email,data) VALUES (?,?,?,?,?,?)").bind(member.id, member.userId, member.organizationId, member.role, member.email, JSON.stringify(member)).run();
  }
  await db.prepare("INSERT INTO runtime_meta (key,value) VALUES ('demo_credentials','simple-role-logins-v1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
}
