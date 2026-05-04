# Documentation Changelog

Use this file to keep a lightweight trail of documentation-impacting changes. Keep entries short and focused on what changed, why it matters, and where follow-up docs live.

## Entry Format

| Date | Area | Change | Related Files |
| --- | --- | --- | --- |

## Entries

| 2026-05-04 | Role-based navigation | Yash Baruah aligned dashboard navigation with role-based access rules for PA4 demo validation; restricted sections now disappear from nav while direct `?view=` access renders a restricted-access state. | `app/dashboard.tsx`, `app/page.tsx`, `lib/auth-permissions.ts`, `tests/dashboard-navigation.test.tsx`, `tests/e2e/auth-helpers.ts`, `tests/e2e/dashboard-role-navigation.spec.ts`, `tests/e2e/ui-visual.spec.ts` |
| 2026-05-04 | PA4 MVP validation | Yash Baruah added PA4 MVP validation coverage for target role selection. | `tests/e2e/skillmatch.spec.ts` |
| 2026-05-04 | PA4 repo cleanup | Yash Baruah clarified demo-mode signup behavior, added role-aware dashboard restrictions, and improved refresh loading/error states for candidate, history, saved-role, and audit data. | `app/login/page.tsx`, `app/signup/page.tsx`, `app/dashboard.tsx`, `app/globals.css`, `lib/auth-permissions.ts`, `lib/auth.ts`, `app/api/candidates/[id]/learning-modules/route.ts`, `tests/auth.test.ts`, `tests/candidate-learning-modules-route.test.ts`, `tests/e2e/skillmatch.spec.ts` |
| 2026-05-02 | UI / front-end | Global UI aligned with ui-ux-pro-max “Trust & Authority” / enterprise slate: slate neutrals and WCAG-friendly muted text, `--sidebar-bg` and inset amber active nav, 200 ms motion tokens, `prefers-reduced-motion`, and `focus-visible` rings (sky default, amber on primaries and header search via `:focus-within`). Inter applied on `<body>` with `next/font`. Also includes sidebar width, concept grid spacing, and prior dashboard/auth polish. | `app/globals.css`, `app/layout.tsx`, `app/dashboard.tsx` |
| 2026-05-02 | Docs process | Added repo-owned documentation workflow, changelog guidance, PR checklist prompts, and artifact organization rules for source vs generated docs. | `README.md`, `docs/README.md`, `docs/source/README.md`, `docs/generated/README.md`, `.github/pull_request_template.md` |
