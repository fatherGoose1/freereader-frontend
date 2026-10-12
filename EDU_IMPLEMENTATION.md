# FreeReader EDU: implementation and staging rollout

The current rollout uses the production backend/Supabase project and the
`feat/edu-portal` Vercel preview, per the owner's request. Consult the current
status/actions at the top of `EDU_deploy steps.md`; staging references below
describe the original design checklist rather than the selected deployment mode.

For the current owner deployment checklist, use
[EDU_deploy steps.md](EDU_deploy%20steps.md). The security review added required
restrictive Storage policy and live Auth-session validation configuration; complete
those steps before activating the feature flags.

## What is implemented

One Next.js codebase/deployment serves the consumer site and the school product.
`edu.freereader.io` maps clean URLs to internal `/edu` routes through `proxy.ts`.
For local development or a preview hostname, use `/edu` directly.

The existing Koko backend implements `/api/v1/freereader/edu/*`; the frontend
forwards authenticated requests through its same-origin `/api/edu/*` proxy.
Files upload directly to private Supabase Storage, avoiding frontend hosting
request-body limits. No service-role key is sent to the browser.

### School workflows

- Provision schools through the trusted backend CLI.
- School administrators invite/revoke staff and remove school access.
- Administrators can also create/manage classes and assignments.
- Teachers create classes, invite students into them, and manage their classes'
  assignments. Administrators can reassign class teachers or add co-teachers.
- Invitations are email-bound, single-use, hashed at rest, and expire in seven days.
  The dashboard generates links for the inviter to send; it does not send email.
- Students sign in through Google and accept their class invitations.
- Teachers upload PDF, EPUB, DOCX, TXT, HTML, or Markdown documents, create drafts,
  publish to one or more classes, edit scheduling/instructions, and archive assignments.
- An assignment can include multiple documents. Publishing pins document versions.
- Student links require authenticated membership/enrollment. Dates govern access;
  the due date alone does not close it.
- School-timezone calendars show assignment windows and due dates, with class
  filtering and administrator creator filtering.
- Student readers display original PDF/EPUB pages or extracted text, with standard
  voices, language-aware speech, speed settings, highlighting, chapters, and original
  file download. Original DOCX/TXT/HTML/Markdown files are retained and downloadable;
  their reading view is extracted text.
- Positions sync through EDU-specific progress records. Completion is explicitly
  marked by the reader; teacher reports distinguish checkpoints from completion.

### Data and storage

Alembic revision `20261012_0022` creates the `edu` schema. It adds no columns to
consumer tables. Composite foreign keys prevent cross-school relationships.
School/user/class access is checked by backend APIs. PostgreSQL RLS is enabled,
and browser `anon`/`authenticated` roles have no EDU schema access. This is a
backend-only schema: **do not expose `edu` in Supabase's Data API schemas**.
The backend connects as the table owner or another appropriate backend-only role.

The backend creates the private `freereader-edu-documents` bucket on first upload
using its existing service-role credentials. It refuses consumer/author bucket
names and existing public buckets. Do not add browser read/write policies for
this bucket; all access uses backend-authorized signed URLs.
Install `koko-backend/migrations/edu_storage_policy.sql` in the Supabase SQL Editor
before uploads. This restrictive policy protects `freereader-edu-*` objects even
when other permissive policies are broad. Storage operations fail closed when it
is absent/weakened; the backend also rechecks that the bucket remains private.
The bucket restricts MIME types to octet-stream, gzip, and MP4 audio; active HTML
originals are stored as download bytes rather than executable hosted pages.
Signing responses must contain action-scoped, path-bound, expiring tokens.

```text
schools/<school-id>/documents/<document-id>/versions/<version-id>/
    original.<format>
    reading.json.gz

schools/<school-id>/audio/<version-id>/<cache-key>.m4a
```

Upload completion verifies original size/signature/hash and validates the bounded
reading copy. Original hashing is streamed in the backend. Only ready document
versions can be assigned. Browser downloads verify hashes before reading.
The same hosted original is available from a fresh browser; students do not need
to reattach files. EDU currently holds reading copies in memory, rather than
adding them to the consumer IndexedDB library. Reopening requires connectivity.

Limits: original 100 MB (matching the existing parser); gzip reading copy 10 MiB; expanded reading JSON 40 MiB.
Supabase's project-level file-size limit must permit the original limit. A
project/plan limited to 50 MiB needs an appropriate storage plan/configuration
before using 100 MB originals.

### Telemetry and speech

`edu.telemetry_events` preserves the consumer event columns/types and adds
school, verified actor/role, class, assignment, document, and version linkage.
The existing event validator remains authoritative. Original text, filenames,
titles, email addresses, and URLs are excluded from event properties.

EDU has its own installation/session IDs, per-actor/per-school event queues,
authenticated telemetry endpoint, and server speech events. Context is captured
when an event occurs, and the backend validates all referenced records. Revoked
assignments/invalid events cannot permanently block subsequent queued events.
Consumer PostHog initialization is skipped on EDU surfaces.
An EDU analytics boundary also pauses consumer recording/capture during client
navigation into EDU, and the consumer support widget is excluded from school pages.
OAuth return paths are restricted to same-origin EDU routes, and pending frontend
operations are bound to their initiating account rather than the latest session.

Speech takes an assignment/version/block reference, not arbitrary student-supplied
text. It uses the existing Kokoro/Supertonic synthesis functions. Generated audio
is cached privately per school, document version, passage, voice, speed, settings,
and model revision. It is generated on demand, not for entire documents upfront.
The browser prefetches a bounded 30-second/four-passage window after playback begins.

EDU rate buckets are separate and school/account based rather than campus-IP
based. EDU and consumer inference still share the existing model admission cap,
so `EDU_SPEECH_ENABLED` is independently disabled by default. These are capacity
guardrails, not a guarantee that the existing inference deployment serves 100
schools simultaneously. Load-test shared speech before a pilot, then size the
inference workers using measured peak concurrency and first-audio latency.

## What the project owner needs to configure

### 1. Staging infrastructure

Use an isolated staging backend/Supabase project to exercise migrations and real
storage/OAuth before enabling the school product in the production deployment.
Both products can still share one deployment when EDU is ready.

Frontend staging environment:

```dotenv
EDU_ENABLED=true
EDU_HOST=edu.freereader.io
NEXT_PUBLIC_EDU_HOST=edu.freereader.io
KOKO_BACKEND_URL=https://your-staging-backend
NEXT_PUBLIC_SUPABASE_URL=https://your-staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-staging-publishable-key
```

Backend staging environment:

```dotenv
EDU_ENABLED=true
EDU_SPEECH_ENABLED=true
EDU_SITE_URL=https://your-preview-host/edu
EDU_STORAGE_BUCKET=freereader-edu-documents
```

The backend also needs its existing `DATABASE_URL`, Supabase URL/JWT configuration,
and server-only service-role key for that same staging project. Existing TTS model
settings apply. No additional frontend storage credential is needed.
The database role needs the Auth read permissions in the deployment checklist;
every EDU request checks its live Supabase session/account, preventing continued
API use after logout, deletion, or banning. Run `edu-security-check` before activation.

For a dedicated staging EDU hostname, set both frontend host variables to that
hostname and set backend `EDU_SITE_URL=https://that-hostname` without `/edu`.
`NEXT_PUBLIC_EDU_HOST` is embedded at build time; rebuild when changing it.

### 2. Authentication redirect allowlist

Add the appropriate callback URLs in **Supabase Authentication → URL Configuration**:

- Dedicated school hostname: `https://edu.freereader.io/auth/callback`.
- Preview/local host: `https://your-preview-host/edu/auth/callback` or
  `http://localhost:3000/edu/auth/callback`.

Reuse the existing Google provider. Keep existing consumer callback URLs and
the global Supabase Site URL in place. Google continues redirecting through
Supabase's own OAuth callback. EDU uses a distinct browser auth storage key and
PKCE flow, rather than sharing the consumer browser session.

### 3. Migration and first school

Deploy the backend before the frontend. Its existing Railway start command runs
`flask db upgrade`; manually use the same command for staging/local setups:

```bash
flask --app koko_backend:create_app db upgrade
flask --app koko_backend:create_app edu-create-school \
  --name "Example Academy" \
  --admin-email "admin@example.edu" \
  --timezone "America/New_York"
```

Send the printed invitation to the administrator. To reissue an expired first
invitation or provision another administrator from the trusted CLI:

```bash
flask --app koko_backend:create_app edu-invite-admin \
  --school-id "school-uuid" --email "admin@example.edu"
```

Keep these invitation URLs out of public logs/tickets. School provisioning and
bucket creation are automatic; the restrictive Storage policy and any necessary
Auth read grants must be installed by the project owner beforehand.

For abandoned uploads, schedule this backend command daily:

```bash
flask --app koko_backend:create_app edu-cleanup-uploads
```

It removes pending uploads older than two days, after signed upload tokens expire.
Published/archived document versions, progress, and audio currently remain stored;
agree on a school retention policy before broad rollout.

### 4. Staging acceptance checks

1. Create two schools and separate admin/teacher/student accounts.
2. Accept a staff invitation; verify wrong-email, revoked, expired, and repeated
   invitation use fails.
3. Create classes, enroll students, upload real PDFs/EPUBs/DOCX files, and publish
   an assignment. Confirm originals and reading copies appear only in the EDU bucket.
4. Open the student link in a fresh browser/device. Confirm original PDF/EPUB layout,
   playback/highlighting, progress restoration, and downloadable originals.
5. Check future availability, past-due access, closing time, school timezone,
   draft visibility, editing conflicts, and assignment archival.
6. Remove a student/teacher and confirm subsequent API/file-link issuance is denied.
   Already issued download links remain usable for their short expiration window.
7. Verify school A accounts cannot access school B classes, assignments, files,
   reports, or telemetry context. Reassign a removed teacher's classes as an admin.
8. Inspect `edu.telemetry_events`; verify school/assignment/actor linkage and that
   consumer telemetry/library tables did not receive school activity.
9. Exercise consumer import, native rendering, account sync, public books, support,
   and speech with EDU disabled and then with a small EDU load in staging.
10. Measure actual speech capacity under simultaneous classroom playback, including
    cache misses and different voices/speeds, before enabling a school pilot.

Automated verification commands:

```bash
# Frontend
npm test
npm run test:edu
npx tsc --noEmit
EDU_ENABLED=true npm run build
EDU_ENABLED=true PLAYWRIGHT_PORT=3127 npx playwright test tests/browser/edu.spec.ts

# Backend
python -m pytest
# Destructive test fixture: ONLY point this at a dedicated test database.
FREEREADER_TEST_DATABASE_URL=postgresql+psycopg://user@localhost/edu_test \
  python -m pytest tests/test_edu.py tests/test_edu_migration.py
```

Browser tests mock auth/storage/speech transport; they exercise actual UI, original
PDF rendering, playback, and progress behavior. Real Supabase OAuth, bucket signing,
and inference still require the staging acceptance checks above.

### 5. Production activation

Attach `edu.freereader.io` to the **same frontend deployment** and configure its
DNS using the hosting provider's domain setup instructions. Set backend
`EDU_SITE_URL=https://edu.freereader.io` for production invitation links.

Until the pilot is ready, leave frontend/backend `EDU_ENABLED=false` and backend
`EDU_SPEECH_ENABLED=false`. Disabled pages/APIs return 404 and issue no EDU queries.
Enabling EDU does not require changing consumer DNS, auth redirects, storage buckets,
or library sync. To withdraw EDU access, turn its feature gates off; no destructive
schema rollback is needed. Existing short-lived signed download URLs may remain
usable until they expire.

## Consumer compatibility boundary

No consumer reader, local storage, account-sync, speech-proxy, or telemetry-ingest
implementation was refactored for EDU. Shared parser/native-viewer/speech functions
are called from separate EDU workflows. The frontend changes outside EDU are the
host-routing proxy, an EDU-only PostHog initialization guard, the new test script,
and configuration/docs. Backend integration registers the gated blueprint/models,
configuration, and provisioning commands. Existing unrelated working-tree changes
were preserved and should be reviewed separately when preparing a deployment.

The existing native-reader browser tests were refreshed to wait for asynchronous
imports, use the current compact mobile player unless expanded controls are needed,
and assert desktop two-page PDF spreads. These are test-only changes; consumer
reader behavior was not altered.

### Verification completed (2026-10-12)

- Existing frontend unit tests: **150 passed**.
- EDU unit/API/routing/timezone tests: **7 passed**.
- TypeScript and production build with EDU enabled: passed.
- EDU browser workflows on mobile Chromium, mobile WebKit, and desktop Chromium:
  **9 passed** (hosted original PDF, audio/progress restore, teacher authoring,
  original + reading-copy uploads, and publication).
- Consumer native-reader checks on those same browsers with EDU disabled:
  **15 passed**, including full EPUB/PDF reading and native/text view switching.
- Consumer layout/support checks on mobile and desktop Chromium: **5 passed**,
  **3 intentional platform-specific skips**.
- Backend suite on SQLite: **393 passed**, with the PostgreSQL-only migration
  check skipped there.
- EDU authorization/storage/speech/migration tests on a temporary PostgreSQL
  database: **14 passed**, including schema permissions, RLS, cross-school
  constraints, and consumer/EDU telemetry column parity.

The temporary PostgreSQL server was stopped after verification. No production
database, OAuth settings, storage buckets, DNS, or deployments were changed.

The subsequent security review tightened live session/current-email verification,
account-bound frontend requests, concurrent authorization checks, Storage object
and bucket policies, action-scoped signing, MIME restrictions, redirect handling,
and analytics/support exclusion. Current verification totals and the required
provider setup are recorded in [EDU_deploy steps.md](EDU_deploy%20steps.md).

## Initial scope and follow-up work

This is a functional, staging-ready school MVP, not a capacity-tested 100-school
launch. Google login and manual email-bound invitation links are implemented.
Microsoft/enterprise SSO, automated invitation email, bulk roster/CSV/SIS imports,
OCR for scanned documents, school billing, retention/purge automation, and a
background processing fleet are follow-ups. Scanned PDFs still need a readable
text layer supported by the existing parser. EDU has no anonymous assignment mode
or offline assignment reader in this initial version.
