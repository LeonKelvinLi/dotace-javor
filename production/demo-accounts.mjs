// Public, fictional training accounts. These are never created in client production.
export const demoAccounts = [
  { key: "federation", email: "federation@demo.javor.example", password: "FederationDemo2026!", name: "Kontrolor federace", role: "federation", organizationId: "" },
  { key: "organization", email: "organization@demo.javor.example", password: "OrganizationDemo2026!", name: "Správce FK Háj", role: "org_admin", organizationId: "org-haj" },
];

export async function prepareDemoAccounts(db, auth, bucket, seedDemo) {
  const owner = demoAccounts[0];
  await db.prepare("INSERT OR IGNORE INTO bootstrap (id,owner_id,seeded) VALUES ('owner',?,0)").bind(`render:${owner.email}`).run();
  await seedDemo(db, bucket);
  for (const account of demoAccounts) {
    if (!await db.prepare("SELECT email FROM app_accounts WHERE email=?").bind(account.email).first()) {
      await auth.addAccount(account.email, account.password);
    }
    const member = { id: `demo-member-${account.key}`, userId: `render:${account.email}`, email: account.email, name: account.name, role: account.role, organizationId: account.organizationId };
    await db.prepare("INSERT OR IGNORE INTO memberships (id,user_id,organization_id,role,email,data) VALUES (?,?,?,?,?,?)").bind(member.id, member.userId, member.organizationId, member.role, member.email, JSON.stringify(member)).run();
  }
}
