# Documentation Update Process

Keep documentation changes in the same pull request as the software change whenever possible.

## When To Update Docs

Update repo documentation if a change affects any of these:

- Local setup or environment configuration
- User-visible behavior or workflow expectations
- Database, storage, auth, or integration design
- Developer workflows, testing steps, or operational runbooks

## What To Update

Use the smallest set of files that keeps the repo accurate:

- `README.md` for setup, architecture summary, environment variables, and common commands
- `docs/` files for implementation details, process notes, or longer-lived reference material
- `docs/implementation-change-log.md` for a short dated note about meaningful documentation-impacting changes

## Change Log Format

Add one entry per relevant change using this format:

```md
## YYYY-MM-DD

- Short note describing the software change and which documentation was updated.
```

Keep entries brief. The goal is traceability, not a full release history.

## Pull Request Expectation

Before opening a PR:

1. Check whether the code change affects documented behavior or implementation details.
2. Update the relevant `README.md` or `docs/**` files in the same branch.
3. Add or update the dated note in `docs/implementation-change-log.md` if the change altered repo-facing implementation details.
4. Complete the PR checklist item confirming the documentation review.
