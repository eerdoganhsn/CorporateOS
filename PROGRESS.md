# CorporateOS — Progress / Handoff Notes

_Last updated: 2026-11-23. Working notes for resuming development; not end-user documentation._

## Status by phase

| Phase | Status |
|---|---|
| 0 Environment | ✅ .NET SDK 10.0.404 + Git 2.56.1 installed via winget; Docker 29.9 running |
| 1–9 Backend (foundation, auth, org, projects/tasks, leave, expenses, content, platform, reports, dashboard, search, profile, seeder, scheduled jobs) | ✅ Builds 0 warnings / 0 errors. Verified against real SQL Server: `scripts/dev-checks/smoke.ps1` (all roles, 52 GET endpoints, only expected 403s) and `flows.ps1` (55/55 workflow checks passed) |
| 10 Frontend foundation | ✅ |
| 11–12 Frontend modules + admin panel | ✅ All pages written and routed. `tsc -b`, `eslint .`, `vite build` all pass |
| Browser verification | ✅ `check.mjs` → TOTAL PROBLEMS: 0; dev mode works via junction (see below) |
| 13 UI polish | ✅ Mobile overflow, chart axis labels (see below) |
| 14 Tests | ✅ 99 unit + 48 integration tests, all passing (see below) |
| 15 Finalization | ✅ README, clean reset + seed, all builds/tests green, pushed to GitHub |

## Browser verification + Phase 13 (done 2026-11-23)

**Dev server and `#` in the path — resolved with a junction.** Vite's dev server cannot serve a project whose real path
contains `#`. A junction alone is not enough because Node and Vite resolve symlinks back to the real path. What works:
1. `New-Item -ItemType Junction -Path C:devCorporateOS -Target <repo>` (one-time).
2. `frontend/vite.config.ts` now sets `resolve.preserveSymlinks: true` and builds the `@` alias from `process.cwd()`
   when the cwd is this folder reached through a link (`import.meta.dirname` is always the real path).
3. Run from the junction: `cd C:devCorporateOSrontend; npm run dev:link`
   (= `node --preserve-symlinks --preserve-symlinks-main node_modules/vite/bin/vite.js`).
Verified: login page renders with HMR connected. Plain `npm run dev` from the real path still fails (to be documented in README).
`vite build` / `vite preview` work from either path.

**check.mjs** — `TOTAL PROBLEMS: 0` (against `vite build && vite preview --port 5173`).
`scripts/dev-checks` now has its own `package.json` (`npm install` there, then `npm run check`); `shots/` is git-ignored.
Script fixes: anonymous `/api/auth/refresh` 401 on the login page is expected (other 401s still fail); the leave workflow
picks a random future weekday and retries on 409 overlap (runs are repeatable); approval works with several matching rows;
mobile overflow now counts as a failure and covers 15 pages (Employee + Admin); screenshots wait for chart animations.

**Phase 13 UI fixes (from screenshots):**
- Mobile horizontal overflow on dashboards: `Card` gets `min-w-0` so grid items can shrink below long truncated text.
- Vertical bar chart labels collided ("CompletedCancelled"): wrapping x-axis tick (`WrappingCategoryTick`).
- Trend chart x-axis dropped month labels irregularly: `interval="equidistantPreserveStart"`.
- Reviewed all 40+ screenshots; no other layout issues. (Native date inputs show "gg.aa.yyyy" only because the
  headless browser uses the Turkish OS locale.)

## Phase 14 — tests (done 2026-11-23)

`dotnet test` from `backend/`. Integration tests need Docker (Testcontainers pulls/uses `mcr.microsoft.com/mssql/server:2022-latest`).

**Unit (`tests/CorporateOS.UnitTests`, 99 tests, ~1 s)** — xUnit + FluentAssertions + EF InMemory + `FakeTimeProvider`
(`Microsoft.Extensions.TimeProvider.Testing` 10.0.0; validators are evaluated against a fixed "today").
- `Validation/ValidatorTests.cs`: employee (email, employee number, phone, hire/birth date, account role/password),
  project (dates, progress, budget, code), task progress + due date, leave (dates, 30-day past limit, 1-year span, Other needs reason),
  expense (amount > 0, ≤ 1,000,000, 2 decimals, currency, date window).
- `Domain/LeaveDayCalculatorTests.cs`, `Domain/ApprovalTransitionTests.cs` (LeaveRequest/Expense/Task state rules,
  self-approval blocked, only pending/submitted can be decided, resubmit after rejection, mark-paid).
- `Files/FileSignaturesTests.cs`: genuine files pass, renamed EXE/PNG rejected, WEBP marker, truncated files, binary .txt/.csv.
- `Tasks/TaskServiceAuthorizationTests.cs`: employee can only update progress of own task, cannot cancel/edit/create/delete;
  department manager assigns within department or project members only; other-department manager blocked; project manager
  assigns anyone; inactive assignee rejected (even for admin); admin reassigns.

**Integration (`tests/CorporateOS.IntegrationTests`, 48 tests, ~40 s incl. container start)** — `WebApplicationFactory<Program>`
+ Testcontainers.MsSql, environment "Testing", settings via `builder.UseSetting` (connection string, Jwt:Key, AuthCookie:Secure=false,
AuthPermitLimit=1000, migrations + demo seed on, scheduled jobs off, SMTP off, storage in a temp dir). One container shared by all classes
(`ApiCollection`).
- `AuthTests`: login OK (HttpOnly/SameSite=Strict cookie, no token in body), wrong password vs unknown user give the same 401,
  400 on malformed email, 401 without/with forged token, refresh rotation, reuse inside the grace window keeps the session,
  **reuse after the grace window revokes all sessions** (the app's `TimeProvider` is replaced by `ShiftableTimeProvider` =
  real time + offset, advanced 11 s; JWT ClockSkew is 30 s so tokens stay valid), logout revokes the token.
- `AuthorizationTests`: Employee → admin/manager endpoints 403; Manager → admin endpoints + security settings 403;
  Admin → SuperAdmin-only security settings and granting SuperAdmin 403 (SuperAdmin 200); Admin/SuperAdmin/Manager → employees 200.
- `WorkflowTests`: employee create / duplicate email or number (409) / invalid email (400) / manager forbidden;
  project create / end < start (400) / employee forbidden; leave submit → approve (second approve 422) / reject (reason required) /
  invalid dates / overlap 409 / employee cannot approve; expense draft → submit → approve (then locked, 422) / reject → resubmit /
  draft cannot be approved (422) / amount ≤ 0 (400) / employee cannot approve.

## Phase 15 — finalization (done 2026-11-23)

- `README.md` written: features, architecture, structure, prerequisites, getting started (incl. the `#` path / junction note),
  demo accounts, configuration table, tests, browser checks, roles matrix, security, DB/migrations/reset, limitations, troubleshooting.
- Fix found while writing it: the login page showed the demo accounts (with password) in production builds too. Now shown in
  `vite dev`, and in builds only with `VITE_SHOW_DEMO_ACCOUNTS=true` (set in local `frontend/.env` and `.env.example`).
  Verified: with the flag off the password string is not in the bundle.
- Final results: `dotnet build` 0 warnings / 0 errors; `dotnet test` 99 unit + 48 integration passed; `npm run lint` clean;
  `npm run build` OK; `check.mjs` TOTAL PROBLEMS: 0. Local DB dropped and re-seeded afterwards (25 employees, 6 projects).
- `git add --dry-run`: 243 files, no `.env`, build output, uploads, logs, `dist` or screenshots.

## Remaining work (in order)

1. ~~Browser verification~~ ✅ 2. ~~Phase 13~~ ✅
3. ~~Phase 14 tests~~ ✅
4. ~~Phase 15~~ ✅
5. README rewritten as a showcase (badges, Mermaid diagrams, screenshot gallery in `docs/screenshots`, regenerated by `scripts/dev-checks/screenshots.mjs`). Local SuperAdmin test user created for the owner: kullanici@corporateos.local (local DB only).
6. ~~First git commit + push~~ ✅ https://github.com/eerdoganhsn/CorporateOS (public, branch `main`). Repo-local identity: eerdoganhsn <eerdoganhsn@users.noreply.github.com>. Pushing from an agent shell needs GCM_INTERACTIVE / GIT_TERMINAL_PROMPT unset (credentials are stored in Git Credential Manager).
7. **Language module (i18n) — in progress, see the section above.**

## Language module (i18n) — IN PROGRESS (paused 2026-11-23, resume here)

**Decisions (from the user):** languages **tr + en + de**; translate **the whole app** (UI + API errors/validation +
notifications + e-mails + report/export labels); preference stored **in the user profile** (DB); default language is
**always Turkish** (no browser detection; before login use the last choice in localStorage, else tr).

**Done (uncommitted, backend does not compile-break yet — nothing references the new code):**
- `backend/src/CorporateOS.Domain/Localization/Text.cs`: `Languages` (tr/en/de, default tr, `Normalize`, `Current` from
  CurrentUICulture), `Text.Get/For/Enum` (fallback en → key; args: Enum → translated, DateOnly "d", DateTime "g",
  decimal N2), `LocalizedText.Of/Raw` (render later in the recipient's language).
- Catalogs `Localization/Resources/{en,tr,de}.json` — 450 keys each, verified identical keys + placeholders.
  Embedded via `EmbeddedResource` in `CorporateOS.Domain.csproj`. Key groups: error.*, entity.*, file.*, auth.*
  (incl. resetEmail.*), password.*, identity.*, per-feature messages, report.* (title/description/chart/col/sum),
  settings.* + setting.<Key>.label/description, user.*, permission.area/*, notify.*, enum.<Type>.<Value>.

- ✅ Step 1: every hard-coded API message now goes through `Text.Get` (validators use lazy `WithMessage(_ => ...)`,
  `NotFoundException(entity, key)` translates `entity.<Name>`, exception defaults are null → catalog). Unit tests run in
  English via `tests/CorporateOS.UnitTests/TestCulture.cs` (module initializer) + `Domain/LocalizationTests.cs`
  (catalog completeness, placeholders, enum keys).
- ✅ Step 2: `UseRequestLanguage()` (WebApplicationExtensions) is the FIRST middleware (before UseExceptionHandler, since
  the culture does not flow back out of inner middleware); sets only CurrentUICulture from Accept-Language (q-sorted),
  writes Content-Language/Vary in OnStarting (exception handler clears headers). Program.cs default UI culture = tr,
  fixed FluentValidation culture removed. Integration clients send `Accept-Language: en` (ApiFactory.ConfigureClient);
  `IntegrationTests/LocalizationTests.cs` covers tr/de/en/default. Tests: 109 unit + 56 integration green.
  Note: a running API locks bin/ — build/test with `--artifacts-path <scratch>` instead of killing it.
- ✅ Step 3: `ApplicationUser.PreferredLanguage` (nvarchar(5), default 'tr', migration `AddUserPreferredLanguage`),
  `AuthUserDto.Language` (last positional arg), `PUT /api/profile/language` (ProfileService.UpdateLanguageAsync, audited
  as Profile.LanguageChanged, returns AuthUserDto). Migration was generated with `--configuration Release` because the
  running API locked the Debug bin. Tests: 109 unit + 57 integration green.

**Backend TODO (in order):**
1. ~~Replace every hard-coded message with `Text.Get(...)` (list: grep `Exception(`/`WithMessage(` in backend/src).
   `NotFoundException(entity, key)` → build message from `entity.<Name>`; rename call args "Leave request" → "LeaveRequest",
   "Project member" → "ProjectMember". Validator messages must use `.WithMessage(_ => Text.Get(...))` (lazy, per request).
   Domain entities (Operations.cs) use leave.approveNotPending/rejectNotPending/cancelNotPending, expense.* keys.~~ ✅
2. ~~Request culture: small middleware after CORS — read `Accept-Language`, `Languages.Normalize`, set **only
   CurrentUICulture** (keep CurrentCulture invariant). Remove the fixed en-US FluentValidation culture in Program.cs
   (built-in tr/de messages then apply). Localize GlobalExceptionHandler, ValidationFilter, JWT challenge/forbidden and
   rate-limit messages in ApiServiceCollectionExtensions.~~ ✅
3. ~~`ApplicationUser.PreferredLanguage` (string(5), default "tr") + migration; `AuthUserDto.Language`;
   `PUT /api/profile/language` (validate with Languages.IsSupported, key auth.unsupportedLanguage).~~ ✅
4. Notifications: change `INotificationPublisher` to take `LocalizedText` title/message; publisher loads recipients'
   PreferredLanguage and renders per recipient (announcement title = LocalizedText.Raw). Update 19 call sites + unit-test fakes.
   Expense amounts: pass amount (decimal) and currency as separate args (templates use "{1} {2}").
5. Password-reset e-mail in the user's language (auth.resetEmail.*). IdentityErrorDescriber + SettingsPasswordValidator → password.*/identity.*.
6. Reports: `Col(key, type)` label = `report.col.<key>` (note: projects "name" column uses report.col.project, tasks "name" uses
   report.col.assignee); summaries report.sum.*; status columns keep enum values in rows (frontend translates);
   `ToTable` translates Enum values for CSV/Excel; scope label report.allDepartments; sheet name report.sheet.
7. Settings DTO label/description/category from setting.* keys; PermissionMatrix → permission.* keys.
8. Dashboard `MonthLabel`: return "yyyy-MM" and let the frontend format, or format with UI culture.
9. Tests: unit tests set CultureInfo.DefaultThreadCurrentUICulture = en (module initializer) + a catalog-completeness test;
   integration test clients send `Accept-Language: en`; add tests for tr/de responses and per-recipient notification language.

**Frontend TODO:** i18next + react-i18next; `src/i18n/` with typed resources (en as source type, tr/de must match);
language switcher (header user menu, profile page, login page); axios `Accept-Language` header; sync with profile
language after login; date-fns locale (tr/de/enUS) + Intl number/currency formatting in `utils/format`; zod messages
as translation keys (FormField renders `t(message)`); enum labels via `enums.<Type>.<Value>`; then translate all 77 tsx
files (~1200 strings). check.mjs: run in English (switch language first) or update selectors.

**Finally:** dotnet build/test, npm lint/build, check.mjs, README section on languages, commit + push.

## Environment notes

- New shells need a PATH refresh for dotnet/git:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
- `dotnet ef` is at `%USERPROFILE%\.dotnet\tools`. **Build before `--no-build`**: `dotnet ef migrations add` generates files
  after its build, so a stale DLL won't contain the new migration.
- Local `.env` (git-ignored) has random secrets. Mailpit uses ports **1026 (SMTP) / 8026 (UI)** locally because another
  project's container holds 8025. The `.env.example` defaults are 1025/8025.
- Reset dev data: `dotnet ef database drop --force --project src/CorporateOS.Infrastructure --startup-project src/CorporateOS.API`,
  delete `backend/src/CorporateOS.API/App_Data`, start the API (it migrates and seeds in Development).
- Auth rate limit: 10/min/IP by default, 100 in Development (`appsettings.Development.json`).
- Ports: API http://localhost:5000 (Swagger at /swagger), frontend http://localhost:5173.
- Decisions so far: .NET 10 LTS (not 11); TypeScript pinned to 5.9 for typescript-eslint; ESLint + Prettier replace the
  template's oxlint; enums stored as strings; refresh token in an HttpOnly SameSite=Strict cookie, access token in memory.
