# Using Dotace Javor

Open https://dotace-javor-99x6.onrender.com/ and sign in with your app email and password. The app starts in Czech; the **English** button changes the interface and remembers your preference. Original document content remains in its original language.

## Try the sample first

1. Click **Vyzkoušet ukázkové vyúčtování / Try the sample settlement**.
2. Follow the green next-step panel. It opens the next expense needing attention.
3. Document reading runs automatically. Compare the details with the original, explain any warning, check the confirmation box, then **Uložit doklad / Save expense**.
4. When all expenses are checked, the next action becomes **Zkontrolovat a odeslat / Review and submit**. Read the declaration before submitting.
5. As the federation administrator, use **Otevřít další výdaj ke kontrole / Review next expense**. Accept, reject with a reason, or request more information.
6. Finish the review with a conclusion, then open **Souhrn / Summary** and **Stáhnout PDF / Download PDF**.

Use fictional records for practice. Real submissions and approval decisions belong to the authorized organization and federation reviewers.

## Set up your own workspace

1. Click **Založit vlastní organizaci / Set up your own organization**. Enter its name and eight-digit company ID. You can attach its document for autofill or explicitly look it up in ARES. Check the result and save.
2. The saved organization opens automatically. Click **Založit smlouvu / Create contract**, enter the grant and dates, then save. Optional cash/payment conditions are collapsed under **Další podmínky a hotovost / Other conditions and cash payments**.
3. The saved contract opens automatically. Add the signed contract and relevant policy files under **Smlouva a pravidla / Contract and rules**.
4. From the organization profile, **Pozvat člena / Invite member** creates an invitation link. Copy and share it with the intended recipient yourself; the app does not send an email. The recipient sets up their own account with that link.
5. The organization adds its expenses and submits them. You review them from the **Ke kontrole / To review** filter.

## What automatic reading does

Every supported uploaded receipt runs through browser OCR. Known details are filled automatically; saved values and manual corrections take priority. Check the original before saving. A missing or ambiguous payment date must be supplied from payment evidence. An ordinary letter will not become a fabricated invoice. Foreign currency needs an explicit documented CZK conversion.

PDF/image uploads are limited to 10 MB and PDFs to 10 pages. A failure leaves the form available for correction and retry. Optional OpenAI analysis and adviser integration remain unconfigured and unverified; local OCR works independently.

Partial claims need an explanation. Missing attachments and invalid amounts block submission. Another company's expense cannot be made eligible by adding a comment. Cash rules must come from the applicable contract and confirmed federation policy.

## Acceptance checklist

Record the actual result and verification date in the delivery record; unchecked boxes are not implied failures or claimed passes.

- [ ] Reload preserves organization, contract, item, attachment and history data.
- [ ] Two contracts under one organization retain separate items and settlements.
- [ ] Organization members cannot read or modify another organization's records, exports, reports or files.
- [ ] Ordinary members cannot administer access; invitations enforce role and organization on the server.
- [ ] Unauthorized or signed-out API/file requests are rejected.
- [ ] An invitation is single-use/expiry-controlled and does not bypass hosting access policy.
- [ ] Unsupported/oversized uploads fail clearly; supported documents reopen after reload.
- [ ] Partial claims and individual recipients need comments; wrong-company documents remain blocked/excluded.
- [ ] Missing attachments, invalid amounts and unchecked items block submission.
- [ ] Submitted/approved settlements cannot be silently modified through stale forms or direct API calls.
- [ ] Concurrent/stale edits fail safely rather than overwriting a newer decision.
- [ ] Supplement requests and organization responses survive reload and remain attributable.
- [ ] Category/claim totals exclude excluded items and retain decimal accuracy.
- [ ] CSV safely quotes values and neutralizes spreadsheet formulas.
- [ ] Printable report contains final conclusion/reduction and prints without navigation clutter.
- [ ] PDF extraction, browser OCR/manual fallback and adviser mode are accurately labelled; no fake extraction, ARES or email success is shown.
- [ ] After secure key provisioning, optional live AI extraction/adviser are checked separately with fictional documents; until then they remain explicitly unverified.
- [ ] Build, type checks and meaningful application workflow tests have recorded outcomes.
- [ ] Deployed signed-in behavior is checked at the actual returned hosted URL.

## Remaining demonstration limits

Without a second permitted identity, cross-user invitation acceptance and organization isolation can be checked at the server/test level but are not independently demonstrated live. Optional OpenAI endpoint integration is implemented, but a key and successful live provider calls are still pending. The official ARES endpoint is implemented independently of the unavailable former client system. Real email delivery, legal eligibility certification and the original workbook are not included. See [SCOPE.md](./SCOPE.md) for unresolved inputs and [HANDOVER.md](./HANDOVER.md) for operations and setup.
