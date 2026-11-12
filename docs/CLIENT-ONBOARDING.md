# Client access and first-run setup

New members see a short, role-specific introduction. Federation setup guides an empty workspace through organization, contract and organization-admin invitation. The organization follows upload, check/save and submit. Reviewers see open, review and approve. Getting started reopens the guide; acknowledgment belongs to the signed-in membership and survives sessions.

Login uses personal email/password and an invitation for first access. Public role buttons and credentials are absent. Production roles still come from verified invitations and the configured owner, not a form selection. Invitations prefill the intended email; existing-account sign-in preserves the invitation. Logout revokes the current session and clears local expense drafts.

## Deployment state

The existing Render service was still in DEMO_MODE at the start of this change. Do not deploy the label removal while leaving that public authentication active. No paid service setup has been approved since the client's request to keep it pending Filip's approval.

APP_ENV=prelaunch is an optional closed-access transition. It serves a disabled sign-in page, rejects all auth/API/file requests, clears old session cookies on logout and never opens or migrates the existing database. Set DEMO_MODE=false and SEED_DEMO=false together. Its health response explicitly reports mode=prelaunch and clientAccess=false. Existing disk contents are preserved, not imported into the client workspace.

Actual client activation requires the managed production configuration and verification in PRODUCTION-HANDOVER.md. Prelaunch is not an operational client deployment. Do not bypass the production startup guards or call local-provider tests production-provider evidence.

## Browser verification, 12 November 2026

Tested in visible Chrome against an isolated local protected workspace using fictional people and records, without email delivery:

- Federation sign-in, first organization and contract, organization-admin invitation.
- Returning invitee path, invitation acceptance and separate organization introduction.
- Automatic OCR of a PDF; a different club is flagged instead of inheriting Our organization.
- Reloaded draft retains extracted values; replacing its document updates automatic fields while manual edits remain protected.
- Matching synthetic invoice autofill, explicit checking, save and submission.
- Federation login sees To review; review next expense, accept, approve with conclusion, persisted approved summary.
- Both accounts sign out to the credential form. API tests verify session revocation and role isolation.
- Phone viewport: readable introduction, usable primary action, reopen guide and sign out.

Screenshots are local artifacts under outputs/client-onboarding. No shared live records were modified. Real email delivery, provider MFA, client storage/scanner and restore/monitoring activation remain deployment checks, not proven by this run.
