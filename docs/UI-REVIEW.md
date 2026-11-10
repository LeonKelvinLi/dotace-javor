# Workspace interface review · 10 November 2026

The previous interface gave decorative summary cards, repeated reassuring copy and routine controls similar visual weight. The sidebar consumed substantial space, secondary text was faint, and the receipt dialog put upload/OCR controls below a large preview while Save required scrolling through the form.

The redesign uses neutral surfaces, dark readable type, restrained status colors, simple borders and a compact Javor wordmark. Summary values form a single strip. Submitted/approved counts and status tabs filter the contract list; filter counts remain correct when Chrome translation modifies text. A contract can be created from the overview with an explicit organization selector. Repeated marketing-style copy and the misleading “continuously saved” label were removed.

The receipt editor has independently scrolling document and form panes on desktop and a permanent Save bar. At phone size the panes stack, the Save bar stays within the viewport, and contract rows become compact records with deadline labels instead of a horizontally scrolling table. Logout remains reachable on mobile. OCR controls and the report receipt selector appear above the preview; recognition metadata and manual refill are under details. Automatic completion remains enabled. Initial empty forms use a neutral upload hint instead of immediately displaying multiple error cards.

Modal focus is installed once per opening, so form/OCR updates do not repeatedly focus Close. Navigation returns to the top of a newly opened screen. The sign-in screen follows the same typography, colors and smaller corner radii.

Verification:

- Chrome desktop (default 2056×1046) and 390×844 responsive viewport, including automatic English page translation.
- Review/approved status filters, reset filters and translated row counts.
- New contract creation, explicit organization selection and successful save (fictional local QA contract only).
- Independent editor panes and stable typing focus.
- WebP upload, automatic field completion, permanent mobile Save and successful persistence of a fictional receipt in local QA.
- Mobile document width equals viewport width (390 px); Save bar stayed inside the 844 px viewport.
- 35 unit/lifecycle/extraction checks, 14 backend scenarios and six hosting scenarios pass (55 total); type check and production build pass.

Native UI copy remains Czech. Browser-provided translations were exercised during QA. CSS presentation changes are scoped to screen media so printable summaries retain their existing layout.

Live release: Render deployment `dep-dbpoms6gekts73emgiq0` is live at `d14e1ec29c964ddb5ea1858348ea7f891cc49b90` (10 November 2026). Public health check returned 200. Live Chrome verified the actionable review total, two-contract filtered result, filter reset, split receipt editor, automatic WebP field filling, and Save bar within the desktop viewport. The live 390 px overview had a 390 px document width and readable stacked contract rows. Viewport overrides were reset and the app was left open on the redesigned desktop overview. No browser errors were captured in the final live session. No production contracts, receipts or approvals were created during this UI release verification.

Screenshots (local ignored artifacts): `outputs/ui-refresh/dashboard-desktop.png`, `receipt-desktop.png`, and `dashboard-mobile.png`.
