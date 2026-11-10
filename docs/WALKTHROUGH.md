# Review walkthrough

Allow about ten minutes. Use only the fictional seeded records and fictional files. The UI is Czech. The initial hosted site is owner-private and requires ChatGPT sign-in; do not share a live invitation token in the source repository or screenshots.

## 1. Federation overview

Sign in and open the overview. Inspect organizations, the review queue and contracts. Filter contracts by year, program and organization. Open one organization to see its contracts, contacts, representatives and members. Create a fictional organization and create its contract from that organization's detail.

Upload a fictional signed-contract PDF or image, plus instructions or an ASP decision if desired. Open the stored attachment again after reload. The application stores documents; it does not sign contracts or claim that fictional/sample conditions are current law. The explicit **ARES** action can look up a public organization's name/address by IČO; not-found/unavailable results allow manual entry and must not fabricate details. Keep all application test records fictional.

## 2. Access

Create an organization invitation and copy its link. This creates an application invitation, **not an email**. To test another identity, the site owner must first permit that person through the separate Sites sharing policy. Redeem the token while signed in as that permitted identity. Confirm that organization membership, rather than a role selected in the browser, determines access.

The first-user administrator bootstrap is appropriate only while the deployment remains owner-private. A single owner login cannot independently prove a multi-user sharing or invitation flow; record that limitation if a second permitted identity is unavailable.

## 3. Prepare a settlement

As an authorized organization user, open a contract and its settlement. Upload a fictional PDF or photo. Review extracted PDF text/suggestions when available, and enter or correct supplier, document number, description, payment date, category, document amount and claimed amount.

For a scanned PDF/photo, the browser attempts local OCR. Review the recognized text and suggestions; manual entry is the fallback when recognition fails or is inaccurate. A displayed result must name the extraction method without presenting it as verified eligibility. Optional AI extraction is implemented but remains unconfigured/unverified until the server key is securely provisioned; after that, test it separately with a fictional file and confirm all proposed fields. Open the saved document and confirm the expense remains under the selected contract after reload.

Try these three contrasting cases:

| Case | Expected behavior |
| --- | --- |
| Full claim, organization recipient, complete metadata/attachment | Can be marked checked. |
| Partial claim or an individual recipient | Needs a meaningful explanation and “checked with comment.” |
| Another company's document | Cannot be confirmed for claiming; exclude it. |

A receipt without a named recipient should not trigger a recipient warning. A missing attachment or a claimed amount larger than the document amount should prevent submission.

## 4. Submission and guidance

Inspect category totals and use CSV export. Try submitting with an unchecked or unexplained warning item; correct it, acknowledge the beneficiary declaration, and submit. The federation's review queue should now include this contract, and normal organization editing should no longer be possible.

Ask the adviser whether a coffee machine can be claimed. Without a configured key, confirm that the response identifies the reference-guide fallback and does not pretend to call an LLM. After secure AI configuration, the implemented `/api/adviser` route can use the contract and its uploaded policy documents; test that separately and inspect its named sources. Both modes must state uncertainty where evidence is insufficient and leave the final decision to SFJ.

Cash payments are a policy conflict: the training cost extracts require bank payment, while the later call accepts some small cash expenses. The application should make the conflict visible. A configured review threshold must not be described as an agreed statutory limit.

## 5. Federation review and report

As a federation administrator, open the submitted contract. Filter items with comments or missing attachments. Accept an item; reject another with a reason; request a supplement on a third. Check the persistent item history.

As the organization, answer the supplement request with an explanation/corrected evidence and resubmit through the allowed flow. As federation, verify the response remains in history, make the remaining decisions, and enter the final conclusion and reduction. Review the suggested rejected-item total before confirming the amount.

Open the printable report and use the browser's **Print / Save as PDF**. Check organization, contract, three cost groups, claimed amounts, grant, reduction and final conclusion. This is a new report design; the original Excel template was not supplied.

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
