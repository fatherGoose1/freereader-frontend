# FreeReader EDU — deployment steps for Parker

## Current rollout: production backend + Vercel feature preview

### Reader, sharing, and staff update

- Assignment titles open a dedicated full-screen reader, and publishing opens it
  immediately. EDU now uses the actual consumer FreeReader component/layout/player
  with school/guest adapters, not the old embedded EDU audio controls.
- Teacher **Copy student link · no login** enables an assignment-scoped link.
  Students need no account or class enrollment. Anyone holding that link can read
  its published documents while the assignment is available. Teacher/admin routes
  still require Google login and the same school/class permissions.
- **Revoke student link** blocks subsequent requests; **Regenerate student link**
  replaces it and invalidates the previous link. Archiving/closing an assignment
  also denies guest access. Original objects/audio remain in private EDU storage.
- Anonymous progress/preferences remain on that device. Guest activity is recorded
  under the assignment with an anonymous hashed browser identity; it is not a named
  student's completion/comprehension record and creates no user account.
- Staff invitations now have Name / Email rows, multi-row paste, CSV/TSV/text import,
  editable validation, batch Teacher/Admin role selection, and individual/copy-all
  invitation links. The batch endpoint is admin-only and idempotent for retries.
- Migrations `20261012_0023`/`20261012_0024` add staff names/batch metadata and
  assignment sharing, exclusively in the EDU schema.
- The feature alias has a URL-scoped Vercel protection exception so student links
  do not require Vercel login. Other project/preview protection settings are unchanged.
- EPUB relative chapter links are intercepted and resolved against the archive.
  Spine HTML is sanitized before display and carries a strict no-script CSP, so
  WebKit navigation works without allowing uploaded book scripts to execute.

Real production AAC playback and EPUB chapter navigation were verified on desktop
Chromium, mobile Chromium, and mobile WebKit. Parsing changes are outside this update.

Verified rollout on October 12, 2026:

- Backend `872c5d7`, Railway deployment `7d59efdc-58c0-464a-8b78-3df6a48a428d`: SUCCESS.
- Reader frontend `bc4b2dd`, Vercel deployment `dpl_8LcVPwfrZJcP2s6Fg6CR5aZ8UtDs`: READY.
- Production Alembic head `20261012_0024`; all 17 EDU tables have RLS, and browser
  roles still lack EDU schema access. `edu-security-check` passed.
- Backend checks: 381 passed / 4 skipped; isolated PostgreSQL EDU/migration/security
  checks: 43 passed. Frontend unit checks: 139 consumer + 14 EDU passed. EDU/native
  browser workflows: 36 passed, plus 3 real production AAC playback checks.
- Unauthenticated requests with **no Vercel bypass header**: `/edu` and shared
  reader routes return 200; an invalid guest link API returns 404; teacher
  `/api/edu/session` remains 401 without authentication.

Per the requested rollout, no separate staging environment is being created.
The backend/database/Storage changes are being deployed to production; the
frontend is on `feat/edu-portal`, tested through its Vercel Preview deployment.
The consumer frontend on `main` remains the production site.

Production Supabase project: `kszgohcoirrrucypgipy` (Koko).
Production backend: `https://koko-backend-production-c887.up.railway.app`.
Preview branch: `feat/edu-portal`.

### Verified deployment record (2026-10-12)

- Backend commit: `a507350` on `koko-backend/main`.
- Railway deployment: `3788caf0-6bd2-436f-8d7b-88e9739c3eb7` — **SUCCESS**.
- Production migration revision: `20261012_0022`; all 16 EDU tables have RLS enabled,
  and both `anon` and `authenticated` lack EDU schema usage.
- Production backend flags: EDU and EDU speech **enabled** for preview testing.
- Frontend branch: `feat/edu-portal`, initial feature commit `4121368`.
- Stable preview: **https://freereader-frontend-git-feat-edu-portal-flexytech.vercel.app/edu**
- Verified preview deployment: `dpl_Gybdvo9Z6vejyCaduJpxK366MmGp` — **READY**.
- Production backend `edu-security-check`: **passed on Railway**.
- Production `/health`: **200**; unauthenticated EDU `/session`: **401**.
- Consumer speech smoke check: **200**, valid MP4 audio, 2.625 seconds.
- Preview EDU `/api/edu/session` without a token: **401**.
- Consumer Site URL preserved; production and preview EDU callbacks appended to
  Supabase's existing Google redirect allowlist.
- Vercel EDU flags/file limit configured **only for this feature branch's Preview**;
  the production consumer frontend was not deployed or reconfigured.

Release verification: backend **375 passed**, 4 PostgreSQL-only skips; frontend
consumer unit tests **139 passed**; EDU unit tests **11 passed**; EDU browser tests
**12 passed** across mobile Chromium/WebKit and desktop Chromium; production build passed.
These counts cover the clean release, excluding unrelated pending work.

The preview lockfile upgrades Next.js to 16.4.0 and patches the applicable image/
sanitizer/source-map dependencies. Audit now reports no high/critical vulnerabilities.
Three moderate advisory entries remain in Mammoth's unused CLI argument-formatting
dependency chain; the document conversion API is retained without a breaking downgrade.

### What Parker needs to do now

1. Open the stable preview above and authenticate with Vercel if prompted.
2. Sign into EDU using the Google account you want to use for testing.
3. Provide that account's exact Google email (and your preferred test-school name)
   so the first school-admin invitation can be provisioned. No email was guessed
   and no administrator was granted access to an unrelated account.
4. Accept that invitation, then test the teacher/class/assignment/student workflows.
5. Only if larger originals are required, upgrade Supabase's plan to allow 100 MB
   and then increase the EDU backend/preview/bucket limits together.

The CLI below is available on the deployed Railway container. Its Python
environment is `/opt/venv`, so remote execution can use:

```bash
railway ssh --service koko-backend --environment production -- \
  /opt/venv/bin/flask --app koko_backend:create_app edu-create-school \
  --name "Your Test School" --admin-email "YOUR-GOOGLE-EMAIL" \
  --timezone "America/New_York"
```

The agent cannot perform your interactive Vercel/Google browser login or select
your administrator email. A plan upgrade is also an owner billing action. Cleanup
scheduling and school retention rules are still follow-ups before broad rollout.

Already configured through authenticated CLIs/APIs:

- Restrictive policies on both `storage.objects` and `storage.buckets` for EDU.
- Private `freereader-edu-documents` bucket with the required MIME allowlist.
- Auth-table SELECT access verified for the production backend database role.
- Action-scoped production upload signing verified (`scope=upload`, `upsert=false`).

**Current original-file limit: 50 MiB.** Raising the production Storage project
limit to 100 MB returned HTTP 402 and requires a Supabase plan upgrade. The EDU
backend and preview use the current limit; existing consumer/author bucket limits
are unchanged. Upgrade only if larger originals are needed, then increase
`EDU_MAX_ORIGINAL_BYTES`, `NEXT_PUBLIC_EDU_MAX_ORIGINAL_BYTES`, and the EDU bucket limit.

The release is assembled from clean Git worktrees so unrelated pending marketing,
Internet Archive/import, and consumer speech-protection changes are not released.
The backend includes the operational admission-table/helper dependencies EDU needs,
but does not activate the pending consumer speech wrappers or synthesis timeout changes.
Both products still share the existing inference engines and configured model slots.

You will need to sign into the Vercel preview using your Vercel account if deployment
protection prompts you, then sign into EDU using Google. A school/admin invitation
requires the actual Google account email you want to use; that email has not yet been
provided. The provisioning commands below remain available on the production backend.

The remaining sections are the detailed configuration/reference checklist. Use
the production project and feature preview for this rollout rather than creating
the separate staging infrastructure described in the original checklist.

Follow this checklist in staging first. Keep production EDU disabled until the
real authentication/storage checks and a classroom speech load test pass.
The application code, database migration, authorization checks, and bucket
creation workflow are implemented; the external configuration below is yours to apply.

## 1. Prepare a staging Supabase project and backend

- Use a staging Supabase project and staging backend deployment.
- The backend `DATABASE_URL` must point to the **same Supabase project's database**
  as `SUPABASE_URL`. EDU validates live `auth.sessions` and `auth.users` records,
  in addition to verifying JWT signatures, issuer, audience, and expiration.
- Configure the backend's server-only `SUPABASE_SERVICE_ROLE_KEY` and its JWT/JWKS
  configuration for that project. Never place the service-role key or JWT secret
  in frontend `NEXT_PUBLIC_*` variables.
- Configure the staging frontend's `NEXT_PUBLIC_SUPABASE_URL` and publishable/anon
  key for that project, and `KOKO_BACKEND_URL` for the staging backend.
- Enable the existing Google sign-in provider for the staging project.

Leave these flags off during setup:

```dotenv
# Frontend and backend
EDU_ENABLED=false

# Backend only
EDU_SPEECH_ENABLED=false
```

## 2. Configure frontend routing and invitation URLs

For a preview hostname serving EDU at `/edu`:

```dotenv
# Frontend
EDU_HOST=edu.freereader.io
NEXT_PUBLIC_EDU_HOST=edu.freereader.io

# Backend
EDU_SITE_URL=https://YOUR-PREVIEW-HOST/edu
EDU_STORAGE_BUCKET=freereader-edu-documents
```

For a dedicated staging EDU hostname, use that hostname in **both** frontend host
variables and set `EDU_SITE_URL=https://THAT-HOST` without `/edu`.
Rebuild the frontend after changing `NEXT_PUBLIC_*` values.

Production will use:

```dotenv
# Frontend
EDU_HOST=edu.freereader.io
NEXT_PUBLIC_EDU_HOST=edu.freereader.io

# Backend
EDU_SITE_URL=https://edu.freereader.io
EDU_STORAGE_BUCKET=freereader-edu-documents
```

Custom EDU bucket names must start with `freereader-edu-` so the restrictive
Storage policy below protects every EDU bucket.

## 3. Add Supabase OAuth redirects

In **Supabase → Authentication → URL Configuration**, add the callback you use:

- Preview: `https://YOUR-PREVIEW-HOST/edu/auth/callback`
- Local frontend: `http://localhost:3000/edu/auth/callback`
- Production: `https://edu.freereader.io/auth/callback`
- Dedicated staging host: `https://THAT-HOST/auth/callback`

Keep existing consumer redirects and the existing global Site URL. Google still
uses Supabase's own provider callback. EDU uses a separate auth storage key and PKCE.

## 4. Apply the EDU database migration

Deploy the backend first. Railway's existing startup command runs the upgrade;
for manual/staging deployment, run in the backend environment:

```bash
flask --app koko_backend:create_app db upgrade
```

Revision `20261012_0022` creates the backend-only `edu` schema. The backend role
needs schema/table creation privileges for this migration and must be able to
access the resulting tables as their owner or an appropriate trusted backend role.

**Do not add `edu` or `auth` to Supabase's exposed Data API schemas.**
Do not grant EDU schema access to `anon` or `authenticated` browser roles.

## 5. Install the restrictive EDU Storage policy — required

A private bucket alone is insufficient if another existing Storage policy allows
all authenticated users to access every bucket. In the staging project's
**Supabase SQL Editor**, with the appropriate policy-management privileges, run
the supplied backend script:

```text
koko-backend/migrations/edu_storage_policy.sql
```

Its exact SQL is:

```sql
BEGIN;
DROP POLICY IF EXISTS freereader_edu_private_objects ON storage.objects;
CREATE POLICY freereader_edu_private_objects ON storage.objects
    AS RESTRICTIVE FOR ALL TO public
    USING (bucket_id NOT LIKE 'freereader-edu-%')
    WITH CHECK (bucket_id NOT LIKE 'freereader-edu-%');
DROP POLICY IF EXISTS freereader_edu_private_buckets ON storage.buckets;
CREATE POLICY freereader_edu_private_buckets ON storage.buckets
    AS RESTRICTIVE FOR ALL TO public
    USING (id NOT LIKE 'freereader-edu-%')
    WITH CHECK (id NOT LIKE 'freereader-edu-%');
COMMIT;
```

This denies ordinary browser reads, listings, uploads, overwrites, and deletes
for EDU objects, even alongside broad permissive policies.
The bucket policy also blocks ordinary users from changing an EDU bucket to public
or modifying its security settings, even if a broad bucket-management policy exists.
The service-role Storage API bypasses RLS and issues scoped signed URLs through
the authorized backend.
The condition does not restrict existing consumer/author bucket names.

**Do not make the EDU bucket public.** Do not weaken this policy or add EDU schema
browser grants as a workaround. The backend refuses Storage operations if the
required restrictive policy is missing/weakened or the bucket is public.

The bucket also needs this exact MIME allowlist, which automatic bucket creation
sets for you:

```text
application/octet-stream
application/gzip
audio/mp4
```

For an existing EDU bucket, set this list in its Storage settings before running
the security check. Originals upload as octet-stream (including HTML documents),
so uploaded active HTML/SVG is not hosted as executable web content.

Check the project's Storage file-size limit: it must support originals up to
**100 MB**. A project/plan capped at 50 MiB needs an appropriate plan/configuration.

## 6. Verify backend Auth read permissions

The backend needs read access to these columns only:

- `auth.users`: `id`, `email`, `email_confirmed_at`, `deleted_at`, `banned_until`
- `auth.sessions`: `id`, `user_id`, `not_after`

The standard privileged Supabase backend database role may already have access.
If you use a restricted custom backend role, a project administrator can grant:

```sql
-- Replace backend_db_role with the actual trusted backend database role.
GRANT USAGE ON SCHEMA auth TO backend_db_role;
GRANT SELECT (id, email, email_confirmed_at, deleted_at, banned_until) ON auth.users TO backend_db_role;
GRANT SELECT (id, user_id, not_after) ON auth.sessions TO backend_db_role;
```

Never grant these permissions to browser roles. The backend fails closed if live
session validation is unavailable. EDU API/storage development requires PostgreSQL
with these Supabase provider tables; SQLite is for consumer development and isolated tests.

Run the backend configuration check:

```bash
flask --app koko_backend:create_app edu-security-check
```

It verifies EDU schema RLS/browser grants, Auth-table access, the restrictive Storage
policy, private bucket/MIME settings, and action-scoped upload tokens. It creates
the private EDU bucket if absent. The deployed Storage service must issue modern
`upload`/`download` scoped tokens; unscoped/legacy tokens are rejected rather than
allowing upload/download token replay. If the provider lacks this support, resolve
that with Supabase before activation rather than removing the check.
Resolve any failed check before enabling EDU.

## 7. Enable staging and create two test schools

Set `EDU_ENABLED=true` in both staging services. Set `EDU_SPEECH_ENABLED=true` in
the staging backend, then redeploy/restart as needed.

Provision each school in the backend environment:

```bash
flask --app koko_backend:create_app edu-create-school \
  --name "Example Academy" \
  --admin-email "ADMIN-SCHOOL-EMAIL" \
  --timezone "America/New_York"
```

Send the printed email-bound invitation privately. It expires after seven days.
To reissue an administrator invitation:

```bash
flask --app koko_backend:create_app edu-invite-admin \
  --school-id "SCHOOL-UUID" --email "ADMIN-SCHOOL-EMAIL"
```

Use distinct admins, teachers, and students in both schools, plus two separate
classes in one school, to test school isolation and class isolation.

## 8. Perform real-provider access and reading tests

- Invite staff/students. Wrong-email, expired, revoked, and reused invitations must fail.
- Upload real PDF/EPUB/DOCX files. Confirm originals, reading copies, and generated
  audio appear only in the private EDU bucket.
- Open a student assignment in a fresh browser and verify original layout,
  highlighting, playback, chapters, download, and progress restoration.
- Try a known assignment/document ID from another school and another unenrolled
  class in the same school. File links, audio (including cached audio), class rosters,
  editing, and teacher reports must be denied.
- Verify students cannot invite teachers/admins, edit assignments, or read another
  student's progress. Changing `userId`/role fields in a request must not change the
  authenticated actor or permissions.
- Remove membership/enrollment and archive assignments. Subsequent authorized API
  attempts must fail. Log out, delete/ban a test Auth user, and verify its old access
  token can no longer use EDU APIs.
- With a test browser JWT or anon key, attempt direct Storage object listing/read/
  overwrite for a known EDU object. It must fail. The authorized reader's scoped
  signed download must still work; do not use service-role credentials for this check.
- Confirm signed download tokens cannot be replayed against upload endpoints, and
  signed upload tokens cannot read files or overwrite an already uploaded version.
- Confirm future availability, due dates, closing times, and school timezone behavior.
- Verify school content/invitation URLs do not reach consumer PostHog events/replays
  or the consumer support inbox. EDU capture uses its own validated event pipeline.
- Verify consumer upload, reading, sync, public books, support, and speech still work.

Use browser developer tools to inspect these calls, but do not paste access tokens,
invitation tokens, service keys, or signed download URLs into public logs/tickets.
Configure your hosting/APM tools to redact authorization headers, signed URL query
tokens, and invitation tokens, and avoid logging EDU document bodies.

## 9. Load-test speech before the pilot

Test simultaneous classroom playback with cold and warm caches and multiple
voices/speeds. Measure first-audio latency, retries, errors, inference utilization,
and consumer speech performance. Size shared inference capacity from those results
before promising 100-school concurrency.

## 10. Activate production when staging passes

1. Repeat the migration, restrictive Storage policy, Auth permissions, and
   `edu-security-check` against the production project.
2. Add `edu.freereader.io` to the **existing frontend deployment**, configure DNS
   using the hosting provider's domain instructions, and verify TLS.
3. Verify production OAuth callbacks and `EDU_SITE_URL=https://edu.freereader.io`.
4. Enable production EDU flags for the pilot only after the checks above pass.
5. Provision the first real school and send its administrator invitation privately.
6. Schedule `flask --app koko_backend:create_app edu-cleanup-uploads` daily to remove
   abandoned pending uploads older than two days.
7. Establish school document/progress/audio retention rules before broad rollout.

Rollback: turn frontend/backend `EDU_ENABLED=false` and backend
`EDU_SPEECH_ENABLED=false`. Keep the migration/policy installed; disabling EDU does
not require dropping tables or changing consumer infrastructure.

## Access-control limits to understand

### Application verification completed

The implementation was reviewed for school/class isolation, account impersonation,
session revocation, document signing, audio cache access, invitation handling,
OAuth redirects, untrusted reading text, and consumer analytics/support leakage.
The review added fail-closed provider checks and targeted regression tests.

- Backend suite: **413 passed**, 4 PostgreSQL-only checks skipped on SQLite.
- EDU/security/migration checks on isolated PostgreSQL: **37 passed**. These include
  broad permissive Storage-policy overrides, blocked bucket-public changes, live
  Auth-session/account revocation, and authorization changes during long requests.
- Existing frontend unit tests: **150 passed**; EDU/security unit tests: **9 passed**.
- EDU browser workflows/security checks: **12 passed** across mobile Chromium,
  mobile WebKit, and desktop Chromium.
- Consumer support browser regression: **5 passed**, 1 desktop-inapplicable skip.
- TypeScript, production build, and whitespace/diff checks passed.

These results verify the application and simulated provider boundaries. Actual
Supabase configuration, signing behavior, OAuth, and inference are validated by
the staging steps above. No production configuration or deployment was changed.

### Signed links and downloaded copies

Authorized document downloads use path-scoped signed URLs valid for **120 seconds**.
They are bearer capabilities: anyone who receives a still-valid signed URL can use
it for that specific file. They are not public assignment links and must not be
logged/shared. Revocation stops new API access and link issuance; an already issued
URL can remain usable until expiry. Uploaded signed URLs grant only a scoped,
non-overwriting upload capability, not document reading access.

Cached/generated audio is served through the authenticated assignment API with
school/class checks; a cache key alone does not grant access. Account and assignment
access are rechecked after long signing/synthesis/cache-read work.

Already downloaded originals/audio cannot be remotely erased from a user's device.
Private-bucket settings, server credentials, and provider policies must remain
correct. Automated tests cover the application boundaries; the real Supabase/hosting
configuration checks above are required before deployment.
