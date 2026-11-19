# Khelo Manyam – Complete DEO Dashboard

This update extends the supplied Firebase project while retaining the existing Firebase Web App configuration and the imported `schools` master collection.

## Modules included

- District overview with school, student and fitness-assessment counts
- Mandal monitoring for the 15 mandals present in `schools.json`
- School master search
- DEO user management (create and activate/deactivate MEO, PD and PET)
- Student registration for Classes 6–10
- Fitness assessment entry with automatic BMI calculation
- Mandal and gender analytics
- Filtered multi-sheet XLSX exports and generated PDF reports (jsPDF + AutoTable), plus quick CSV exports
- Role-scoped Firestore rules

## Important project-specific corrections

1. The earlier callable function used a combined `PD_PET` role. The updated function creates separate `PD` and `PET` roles, matching the login code and dashboard permissions.
2. New staff profiles now include `active: true`, `name`, `displayName`, mandal and school assignment fields.
3. User creation and account activation/deactivation happen through Admin Cloud Functions. The browser is not allowed to write user profile documents.
4. The dashboard connects to the Functions emulator automatically on `localhost` (port 5001).
5. The existing `firebase-config.js`, `.firebaserc`, and `schools.json` are retained from the uploaded project.

## Firestore data model

### `users/{uid}`

- `email`, `name`, `displayName`
- `role`: `DEO`, `MEO`, `PD`, or `PET`
- `active`: boolean
- `mandal`, `mandalCode`
- `schoolUdise`, `schoolName` (PD/PET assigned school; MEO has `schoolUdise: "ALL"`)

The first DEO profile must already exist and have `active: true`. Its document ID must exactly match the Firebase Authentication UID.

### `students/{autoId}`

- `name`, `pen`, `className`, `gender`, `dob`
- `schoolUdise`, `schoolName`, `mandal`, `mandalCode`
- `active`, `createdAt`, `createdBy`

### `fitnessTests/{autoId}`

- `studentId`, `studentName`, `pen`, `className`, `gender`
- `schoolUdise`, `schoolName`, `mandal`, `mandalCode`
- `testDate`, `heightCm`, `weightKg`, `bmi`
- `sitReachInitial`, `sitReachFinal`
- `partialCurlUps30Sec`, `pushUps1Min`, `run50mSec`, `run600mSec`
- `remarks`, `createdAt`, `createdBy`

No student names or PEN values are invented or preloaded. Register only verified student information.

## Role permissions

- **DEO:** district-wide read/write for schools, students and fitness records; user management through callable functions.
- **MEO:** read-only access to schools, students and fitness records within the assigned mandal.
- **PD/PET:** read assigned-school records and create/update student and fitness records only for the assigned school.
- All roles can read only their own user profile. DEO can list user profiles.
- Client-side writes to `users` and `schools` are denied.

## Setup and run locally

Prerequisites: Firebase CLI, Node.js 20 recommended, and access to the `khelo-manyam` Firebase project.

1. Open this folder in VS Code.
2. Confirm `firebase-config.js` points to the intended Firebase Web App.
3. Confirm `.firebaserc` selects the intended Firebase project:
   ```powershell
   firebase.cmd use
   ```
4. Install Cloud Function dependencies:
   ```powershell
   cd functions
   npm install
   cd ..
   ```
5. Deploy the updated callable Functions before using User Management:
   ```powershell
   firebase.cmd deploy --only functions
   ```
6. Start local Hosting:
   ```powershell
   firebase.cmd serve
   ```
7. Open `http://localhost:5000`.

The dashboard calls the deployed `asia-south1` Cloud Functions endpoint for user creation and account status changes. The local `firebase serve` Functions process is not used by the browser. This avoids accidentally mixing a local Functions emulator with production Authentication and Firestore data.

## Deploy

Deploy updated Firestore rules, callable functions and Hosting only after reviewing and testing them against the district project:

```powershell
firebase.cmd deploy --only firestore:rules,functions,hosting
```

Do not run deployment until the project owner has approved the rules and function changes. The functions run in `asia-south1`.

## Initial DEO account

The bootstrap DEO profile is created manually by the Firebase project owner:

- Firebase Authentication user exists.
- Firestore document path: `users/{same-auth-uid}`
- `role: "DEO"`
- `active: true`
- `name` or `displayName`
- `mandal: "ALL"`
- `schoolUdise: "ALL"`

## Notes and limitations

- The current `schools` master contains 200 schools from the supplied source.
- Student and fitness totals remain zero until real records are entered.
- Fitness analytics currently report counts and average recorded BMI; they do not assign pass/fail or age/sex normative fitness grades.
- Reports & Export supports filtered PDF reports and multi-sheet Excel workbooks. Export data is limited to the records already scoped by Firestore role permissions. PDF/Excel libraries load from jsDelivr CDN, so the browser needs internet access for these exports.
- No bulk student import, password reset workflow, or medical interpretation is included in this version.
- Test Firestore rules with the Firebase Emulator before production deployment. Keep service-account private keys out of the project ZIP and chat.


## Fitness Data Entry (Individual + Excel Bulk Upload)

The Fitness Data Entry module supports both single-student entry and spreadsheet import. It uses the existing Firebase Authentication session, `students` collection, and `fitnessTests` collection.

### Supported assessment fields

| Field in Firestore / spreadsheet | Meaning | Unit |
|---|---|---|
| `heightCm` | Height | cm |
| `weightKg` | Weight | kg |
| `bmi` | Automatically calculated from height and weight | kg/m² |
| `run50mSec` | 50m Run | seconds |
| `run600mSec` | 600m Run | seconds |
| `standingBroadJumpCm` | Standing Broad Jump | cm |
| `sitAndReachCm` | Sit and Reach | cm |
| `shuttleRunSec` | Shuttle Run | seconds |

BMI is calculated as `weightKg / (heightCm / 100)^2`. It is not accepted as a manually entered spreadsheet value. Blank measurements are stored as `null`; at least one measurement is required for each assessment.

### Individual entry

1. Register students in Student Management first.
2. Open Fitness Data Entry and select **Individual Entry**.
3. Select a student, assessment date, and enter the measured values.
4. Save the assessment.

### Excel / CSV bulk upload

1. Select **Download Excel Template** in Fitness Data Entry.
2. Fill one assessment per row. Keep the column headings unchanged.
3. Match each student using either `studentId`, or both `pen` and `schoolUdise`. `studentId` is the Firestore document ID in the `students` collection.
4. Use `testDate` in `YYYY-MM-DD` format.
5. Select **Upload Excel / CSV** and choose `.xlsx`, `.xls`, or `.csv`.
6. The importer validates every row before writing. If any row is invalid or cannot be matched to exactly one student, the entire upload is stopped and row errors are displayed.
7. Valid rows are committed in Firestore batches of up to 450 documents.

Required spreadsheet columns: `studentId`, `pen`, `schoolUdise`, `testDate`, `heightCm`, `weightKg`, `run50mSec`, `run600mSec`, `standingBroadJumpCm`, `sitAndReachCm`, `shuttleRunSec`, `remarks`. Use `studentId` OR the `pen` + `schoolUdise` pair to identify a student.

### Permissions

- DEO: view and enter assessments across the district.
- PD / PET: enter assessments only for students in their assigned school.
- MEO: view assessments for their mandal; data entry controls are not shown.
- Firestore Rules must include the `fitnessTests` collection permissions from this project's `firestore.rules`.

### Excel library

The browser uses SheetJS (`xlsx` 0.18.5) from jsDelivr to read and create Excel workbooks. The browser needs internet access to load this library. CSV upload is also supported through the same parser.
