# Documentation Workflow

This repository keeps lightweight, living documentation close to the implementation so software changes and process changes can be reviewed together.

## What Goes Here

- `changelog.md`: short entries for architecture, requirements, testing, deployment, and workflow changes.
- `source/`: editable source artifacts such as `.docx`, slide decks, and draft source material that should be versioned with the repo.
- `generated/`: exported artifacts such as PDFs, submission exports, and presentation renders that are worth preserving.

## Working Rule

Use Markdown in this repo for ongoing maintenance notes and process documentation. Keep Office artifacts only when they are the actual source of record for a class deliverable, external review, or shared handoff.

That means:

- convert living process notes into Markdown when they need frequent updates
- store `.docx` or slide sources in `docs/source/` when the original format matters
- store generated PDFs or exports in `docs/generated/` only when they are needed for review, submission, or traceability
- avoid scattering documentation across personal folders once it becomes relevant to the repo

## When To Update Docs

Update docs in the same pull request when work changes:

- user-facing behavior or product scope
- architecture, data flow, or storage decisions
- authentication, environment, or deployment requirements
- test coverage expectations or QA steps
- operating procedures that another contributor would need to follow

## Minimum Update Process

1. Make the code or workflow change.
2. Update the relevant Markdown or source artifact in `docs/`.
3. Add a concise entry to `docs/changelog.md`.
4. Check the PR checklist before requesting review.
