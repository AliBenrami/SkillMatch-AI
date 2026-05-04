# Documentation Changelog

Use this file to keep a lightweight trail of documentation-impacting changes. Keep entries short and focused on what changed, why it matters, and where follow-up docs live.

## Entry Format

| Date | Area | Change | Related Files |
| --- | --- | --- | --- |

## Entries

| 2026-05-04 | PA4 MVP validation | Yash Baruah added PA4 MVP validation coverage for target role selection. | `tests/e2e/skillmatch.spec.ts` |
| 2026-05-02 | UI / front-end | Global UI aligned with ui-ux-pro-max “Trust & Authority” / enterprise slate: slate neutrals and WCAG-friendly muted text, `--sidebar-bg` and inset amber active nav, 200 ms motion tokens, `prefers-reduced-motion`, and `focus-visible` rings (sky default, amber on primaries and header search via `:focus-within`). Inter applied on `<body>` with `next/font`. Also includes sidebar width, concept grid spacing, and prior dashboard/auth polish. | `app/globals.css`, `app/layout.tsx`, `app/dashboard.tsx` |
| 2026-05-02 | Docs process | Added repo-owned documentation workflow, changelog guidance, PR checklist prompts, and artifact organization rules for source vs generated docs. | `README.md`, `docs/README.md`, `docs/source/README.md`, `docs/generated/README.md`, `.github/pull_request_template.md` |
