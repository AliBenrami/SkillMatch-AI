# Documentation Changelog

Use this file to keep a lightweight trail of documentation-impacting changes. Keep entries short and focused on what changed, why it matters, and where follow-up docs live.

## Entry Format

| Date | Area | Change | Related Files |
| --- | --- | --- | --- |

## Entries

| 2026-05-02 | UI / front-end | Overhauled global styles: expanded sidebar to 220 px with horizontal nav items and bottom logout, refined design tokens (amber brand, clean neutrals, multi-layer shadows, CSS transitions), fixed missing `.data-grid` column rule, improved typography scale, polished upload drop zone hover states, auth page gradient background, and candidate score chips on the analyses screen. Added proper Inter font loading via `next/font/google`. | `app/globals.css`, `app/dashboard.tsx`, `app/layout.tsx` |
| 2026-05-02 | Docs process | Added repo-owned documentation workflow, changelog guidance, PR checklist prompts, and artifact organization rules for source vs generated docs. | `README.md`, `docs/README.md`, `docs/source/README.md`, `docs/generated/README.md`, `.github/pull_request_template.md` |
