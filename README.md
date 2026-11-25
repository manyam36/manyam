# Khelo Manyam

Production app: **https://khelo-manyam.web.app**

Firebase Hosting deployment account and Git commit email: `itcellparvathipurammanyam@gmail.com`. The app uses the Supabase project `ntpivhkomweiejabxtgq` for authentication and records.

District sports and fitness dashboard for DEO, MEO, PD and PET staff. The current app uses **Supabase Authentication and PostgreSQL**, with Row Level Security and an admin-only Edge Function for staff account creation.

The app is configured for the Supabase project `ntpivhkomweiejabxtgq`. Its database schema, 200 school master records, and `manage-users` Edge Function are deployed. The first DEO account is `itcellparvathipurammanyam@gmail.com`. Only public connection settings are saved in `supabase-config.js`; passwords and server keys are not stored in application files. [SUPABASE_SETUP.md](SUPABASE_SETUP.md) documents the setup and future deployment steps.

Features:

- District, mandal and school dashboards and role-scoped records.
- Individual student registration for Classes 6–10.
- Individual and Excel/CSV fitness assessments, with BMI calculated by the database.
- Staff login creation individually or from an Excel file containing `email` and `password`, optional names and per-row assignments, and selectable default assignments.
- Account activation/deactivation, filtered Excel/PDF reports and CSV exports.
- Database summaries for dashboards and analytics; student pages contain at most 100 rows and assessment pages at most 50. Search runs against the full permitted register.
- Searchable student selection and batch spreadsheet matching without downloading the full student register. Full record downloads are reserved for Reports & Export.

Scale validation uses 50,000 synthetic students and 50,000 assessments in local PostgreSQL, including summary totals, last-page search, and school-scoped access. These synthetic records are not uploaded to the hosted database. This validates those operations at that dataset size; storage allowance and concurrent-user performance still depend on real usage.

Run checks with `npm install` followed by `npm test`. Database policies are tested against local PostgreSQL through PGlite; server-function authorization and rollback are tested with mocked Auth/database services. No hosted project or real credentials are used by the default checks. The configured project has also passed opt-in live checks for DEO login, spreadsheet login creation, school access, forbidden staff administration and deactivation. Temporary staff test accounts are removed after checking.

The `schools.json` file contains the existing 200 school master records. Run `npm run seed:prepare` to regenerate `supabase/seed.sql`. Student and fitness records are not fabricated or preloaded.

The original Firebase configuration, rules, functions, import script and legacy rule tests are retained as migration references. The browser no longer imports Firebase or sends requests to Firebase. No existing Firebase records or identities have been deleted or transferred. If that project contains live data, export and map it separately before switching users to Supabase.

Run `npm start` from this folder and open `http://localhost:5000`. This local server publishes only the browser assets. Staff can change their password in Settings after signing in.

For deployment, run `npm run build` to prepare the seven public assets in `dist/`. Firebase Hosting serves only that directory; database setup files, tests and local settings are excluded. Deploy with `firebase deploy --only hosting --account itcellparvathipurammanyam@gmail.com` after signing into that account and selecting its hosting project. Supabase remains the database and authentication provider.
