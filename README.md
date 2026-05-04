# SkillMatch AI

SkillMatch AI is a Next.js application for matching resumes and candidate profiles against target roles. It can run locally with demo credentials and in-memory persistence, or with Neon Postgres and Cloudflare R2 for persistent data and resume object storage.

## Local Setup

1. Install dependencies:

   ```powershell
   npm ci
   ```

2. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Edit `.env.local` with any database, auth, or object storage settings you want to enable.

4. Start the development server:

   ```powershell
   npm run dev
   ```

5. Open `http://localhost:3000`.

## Environment Variables

The available variables are listed in `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Optional for local development; required for persistent database storage | Neon/Postgres connection string used by `lib/db.ts`. When absent, analyses, candidate recommendations, and audit events are kept in process memory. |
| `NEXT_PUBLIC_APP_NAME` | Optional | Public application name displayed by the app. |
| `AUTH_SECRET` | Recommended | Secret used to sign the session cookie. If absent, the app uses a local demo secret from `lib/auth.ts`; set a long random value outside local demos. |
| `BETTER_AUTH_SECRET` | Optional | Compatibility fallback for signing the session cookie when `AUTH_SECRET` is not set. |
| `AUTH_USERS_JSON` | Optional | JSON array of credential users. Each user needs `name`, `email`, `role`, and either `password` or `passwordHash`. When absent, demo credential users from `lib/auth-model.ts` are used. |
| `R2_ACCOUNT_ID` | Optional | Cloudflare account ID for R2/S3-compatible resume storage. |
| `R2_ACCESS_KEY_ID` | Optional | R2 access key ID. |
| `R2_SECRET_ACCESS_KEY` | Optional | R2 secret access key. |
| `R2_BUCKET` | Optional | R2 bucket name. |
| `R2_PUBLIC_BASE_URL` | Optional | Public base URL for stored resumes. If absent while R2 is configured, stored resume URLs use the `r2://bucket/key` form. |

## Database Schema

Persistent storage is modeled with Drizzle ORM in `db/schema.ts` and mirrored by the SQL bootstrap file in `db/schema.sql`:

- `users`
- `analyses`
- `audit_events`
- `candidate_recommendations`
- `saved_target_roles`

Apply the schema before running against a real `DATABASE_URL`. To generate Drizzle migrations from the typed schema, run:

```powershell
npm run db:generate
```

Then apply the repeatable setup step with:

```powershell
npm run db:setup
```

`npm run db:setup` and `npm run db:migrate` both run the same idempotent migration entrypoint. It resolves `DATABASE_URL` from the current shell first, then `.env.local`, then `.env`, which matches the local setup flow above.

If the database is already current, rerunning the command is safe. If no `DATABASE_URL` is configured, the script fails early with a clear message instead of silently falling back to in-memory mode.

For the existing bootstrap SQL, you can still run:

```powershell
psql "$env:DATABASE_URL" -f db/schema.sql
```

You can also paste the contents of `db/schema.sql` into the Neon SQL editor for the target database. The statements use `create table if not exists` and `create index if not exists`, so reapplying the file is safe for the current schema.

## Local Fallbacks

The app is designed to run without external services during local development:

- If `DATABASE_URL` is not set, `lib/db.ts` stores analyses, candidate recommendations, and audit events in memory. Data resets when the dev server restarts.
- `GET /api/health` reports whether the app is using memory fallback or a configured Postgres database, and returns `503` when a database is configured but the expected tables have not been created yet.
- Signup requires `DATABASE_URL`; created accounts are stored in the `users` table. When no database is configured, sign in with demo or `AUTH_USERS_JSON` users instead.
- If any required R2 setting is missing, `lib/storage.ts` stores uploaded resume bytes in an in-memory map and returns `local://...` URLs. Those files are not persisted across server restarts.
- If `AUTH_USERS_JSON` is not set, demo users are loaded from `lib/auth-model.ts`.
- If `AUTH_SECRET` is not set, session cookies are signed with a local demo secret. Configure this value for shared, staging, or production environments.

## Checks and Workflows

Common local checks:

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` starts the app with Playwright's configured web server at `http://127.0.0.1:3000/login` and runs the Chromium end-to-end tests from `tests/e2e`.

For browser-matrix work on issue #40, the Playwright config also supports opt-in Chrome, Edge, and Safari-like WebKit coverage:

```powershell
$env:PLAYWRIGHT_CROSS_BROWSER="1"
npx playwright install webkit
npm run test:e2e
```

You can also target a subset of projects:

```powershell
$env:PLAYWRIGHT_PROJECTS="webkit"
npx playwright install webkit
npm run test:e2e
```

Browser limitations:

- The default `npm run test:e2e` flow stays on the Playwright-managed Chromium project so the existing local and CI checks do not change implicitly.
- The `chrome` and `edge` projects use Playwright browser channels (`channel: "chrome"` and `channel: "msedge"`), so they require locally installed Chrome or Edge.
- The `webkit` project uses Playwright's WebKit browser for Safari-like coverage and requires `npx playwright install webkit` before first use.

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on pull requests and pushes to `main`. It uses Node.js 22, installs dependencies with `npm ci`, installs the Playwright Chromium browser, then runs lint, unit tests, build, and Playwright end-to-end tests.

## Documentation Maintenance

Project documentation now lives in the repo under `docs/` so process notes can evolve with the codebase:

- `docs/README.md` explains the lightweight documentation workflow and when updates are expected.
- `docs/changelog.md` records architecture, requirements, testing, and deployment-facing changes over time.
- `docs/source/` is for editable source artifacts such as `.docx`, slide decks, and working notes when they should be versioned with the repo.
- `docs/generated/` is for exported artifacts such as PDFs or presentation renders when they are needed for review or submission.

When a pull request changes user-facing behavior, architecture, environment requirements, testing strategy, or deployment steps, update the relevant docs in the same branch and note the change in `docs/changelog.md`.
