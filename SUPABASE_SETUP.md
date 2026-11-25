# Supabase setup

The app is connected to `https://ntpivhkomweiejabxtgq.supabase.co`. The schema and 200 school records have been applied, the `manage-users` Edge Function is deployed, and the first DEO account is `itcellparvathipurammanyam@gmail.com`. No Firebase data has been moved. The steps below document how to reproduce this setup; do not reapply the initial schema to the configured database.

## 1. Create your free project

1. Open https://supabase.com/dashboard and create an account.
2. Create a **Free** organization/project called `khelo-manyam`. Choose a nearby region such as Mumbai if available.
3. Set a strong database password and store it privately. You do not need to send it in chat or put it in this project.
4. Wait until the project is ready. Copy the **Project URL** and **publishable key** (or legacy `anon` key) from the project's Connect/API settings.
5. Add those two public settings to `supabase-config.js`:

   ```js
   export const supabaseConfig = {
     url: "https://YOUR_PROJECT_REF.supabase.co",
     publishableKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
   };
   ```

Only the URL and public key belong in the browser. Keep database passwords, personal access tokens and service-role/secret keys private.

## 2. Create the tables and import schools

In the Supabase **SQL Editor**, run these files in order:

1. `supabase/migrations/202611240001_initial.sql`
2. `supabase/seed.sql`

The schema migration is for a new database and is applied once. With the CLI migration workflow, `supabase db push` tracks this automatically; do not both manually apply and push the same migration. The school seed can be run again. It contains exactly the 200 school master records from `schools.json`; no student records are invented.

Tables are `schools`, `profiles`, `students`, and `fitness_tests`. Row Level Security allows DEO district access, MEO read-only mandal access, and PD/PET read/write access to their school. A signed-in identity without an active profile has no school or student access. Browser users cannot provision profiles, change roles, or edit the school master.

## 3. Create the first administrator

1. Under **Authentication → Users → Add user**, create your DEO email and password. Auto-confirm the email for this manually provisioned account.
2. Open `supabase/bootstrap-admin.sql.example`, replace the email and display name with your details, and run it in the SQL Editor.
3. Confirm that the new `profiles` row has the Auth user's UUID, `role = DEO`, `active = true`, `mandal = ALL`, and `schoolUdise = ALL`.
4. Keep the Email/Password provider enabled. Disable public new-user signup under Authentication settings if you want accounts to be created only by the administrator. The server Admin API used by this app can still create staff identities.

There is no default admin password or public route that grants an administrator role.

## 4. Deploy the account management function

The Excel creator needs the `manage-users` Supabase Edge Function. Edge Functions are included within the free plan's limits. The function checks the caller's Auth token and current active DEO profile on every request. It creates the Auth identity and staff profile, and attempts to remove the new identity if the profile insert fails. Passwords are never stored in the public tables or returned in results.

From a terminal in this folder:

```powershell
npx supabase@latest login
npx supabase@latest functions deploy manage-users --project-ref YOUR_PROJECT_REF
```

The deployment reads `supabase/config.toml`. Gateway JWT verification is disabled because the handler verifies each bearer token itself using Supabase Auth, supporting current signing keys. Do not remove the handler's `getUser` and active DEO checks. The function reads the hosted `SUPABASE_URL` and privileged `SUPABASE_SERVICE_ROLE_KEY`, with a fallback to `SUPABASE_SECRET_KEYS` for newer projects. These are supplied server-side; never copy privileged keys into `supabase-config.js`. Deploy both the `index.ts` entrypoint and its `handler.mjs` dependency.

For reference, see the official function deployment guide: https://supabase.com/docs/guides/functions/deploy . The Supabase connector in the current ChatGPT workspace is disabled by its administrator, so this setup uses the dashboard and CLI.

## 5. Run and verify

Run `npm start` in this folder and open http://localhost:5000 . Sign in with the DEO account. Change the initial password in **Settings → Change Password**. Before loading real district records, check:

- The school register shows 200 schools.
- **User Management → Create User** creates a test PET/PD/MEO and shows it in the register.
- **Upload Staff Excel** validates a small file, previews assignments, and creates accounts while leaving the DEO signed in.
- A school account can access only its assigned school, and a MEO account can read only its mandal.
- A deactivated account cannot load application data. Deactivation blocks database access through the profile's active flag; it does not remove the Auth identity or erase cached data from an already open page.
- Student registration, fitness entry, Excel import, and Excel/PDF export work using test records.

After that, run `npm run build` and publish the `dist/` directory to your chosen host. It contains only `index.html`, `app.js`, `supabase-config.js`, `supabase-client.js`, `data-api.mjs`, `managed-users.js`, and `user-import.mjs`. Do not publish server source, tests, `.env` files or service credentials. Firebase Hosting is configured to publish only `dist/`; use `firebase deploy --only hosting --account itcellparvathipurammanyam@gmail.com` with the intended hosting project.

## Staff Excel format

Required headings: `email`, `password`. Optional: `name`, `role`, `mandal`, `schoolUdise`. The admin selects default assignments for missing columns. Names default to the email prefix. Role must be MEO, PD or PET. School assignments must match the imported school master. Passwords need 8–128 characters and must meet your project's password policy.

Use the downloadable template; password and UDISE cells are formatted as Text to preserve leading zeroes. Upload at most 200 accounts and 2 MB per file. Any validation error stops the entire file before account creation. Service errors stop further creation and report completed rows. Remove successful rows before retrying, and inspect Authentication first if a network failure left a creation result uncertain. Existing emails are rejected and passwords are never overwritten. The spreadsheet stays in browser memory and is not uploaded to file storage.

## Fitness data

Register a student first, then use **Fitness Data Entry** for individual assessments or its Excel/CSV template. Identify a student by `studentId`, or by `pen` plus `schoolUdise`. Dates use `YYYY-MM-DD`. Supported measurements are height, weight, 50 m run, 600 m run, standing broad jump, sit and reach, and shuttle run. At least one measurement is required. BMI is generated in PostgreSQL from height and weight. Optional blank dates of birth are stored as SQL NULL.

Fitness imports validate all rows before writing in batches of 450. Each batch is atomic; if a later batch fails, earlier batches remain saved. Inspect the records before retrying an interrupted large upload to avoid duplicates.

## Free plan and expected scale

As checked on 24 November 2026, the Free plan includes 50,000 monthly active users, a 500 MB database, 5 GB egress and 500,000 Edge Function invocations. Free projects can pause after one week of inactivity. Check current details at https://supabase.com/pricing .

100–200 staff accounts are comfortably below the Auth allowance. Students are database records, not login accounts. About 10,000 students plus measured fitness history should be feasible, but actual database size and downloads determine whether usage stays within the free allowance. Queries are scoped per role, indexed by school/mandal, and paginated in 500-row requests. The app caches loaded registers during a session; the DEO's full district reports can still transfer substantial data.

## Existing Firebase records

The original Firebase files are retained but are no longer used by the browser. No live Firebase records or passwords were migrated. If records already exist, obtain an authorized export first, create/map staff Auth UUIDs, map `createdBy` to those UUIDs, import schools before students before assessments, preserve student IDs, and omit `bmi` because it is generated. Historical class/gender values must satisfy the new schema. Firebase password hashes cannot be treated as plaintext passwords; migrate identities through a supported Auth import process or recreate staff credentials securely. Validate counts and permissions before directing existing staff to Supabase.

## Local checks

```powershell
npm install
npm test
```

These cover spreadsheet validation, retrieving 10,000 students, PostgreSQL schema/RLS/constraints, and function authorization, duplicate handling and compensating cleanup. They run locally, without hosted Supabase credentials. Live deployment and login require the project setup above.

For browser checks, run `npx playwright install chromium` then `npm run test:browser`. You may set `BROWSER_EXECUTABLE` to an existing Chromium executable instead. The browser check loads the real unconfigured app, then mocks the Supabase backend to exercise login and Excel/CSV account creation. It needs internet access to the SDK and spreadsheet CDNs and never creates a real account.
