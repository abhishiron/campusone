# CampusOne

A campus management system for Maharaja Surajmal Institute of Technology with four roles: admin, professor, student and parent.
Every button calls a real API and saves to a database. Uploaded files are stored on disk.

## Run it

Requirements: Node.js 18 or newer. No Docker or database server needed.

```bash
git clone https://github.com/abhishiron/campusone.git
cd campusone
npm run setup     # installs everything, creates the database, loads demo data (first time only)
npm run dev       # starts the API on :4000 and the web app on :3000
```

Open http://localhost:3000, pick a role on the sign-in page and press **Fill in** to use its demo account.

| Role      | Sign in with                   | Password     | What to try                                                                 |
|-----------|--------------------------------|--------------|-----------------------------------------------------------------------------|
| Admin     | admin@msit.edu                 | admin123     | Live system health, add or suspend users, add courses, post announcements   |
| Professor | neha.sharma@msit.edu           | prof123      | Open self check-in, take attendance, grade work, enter internal marks, approve leave |
| Student   | 00315003123 (enrollment no.)   | student123   | Attendance tracker and alerts, check in, submit files, study rooms, fees, placements |
| Parent    | sunil.goel@parents.msit.edu    | parent123    | Follow Garv's attendance, grades and exams, pay fees                        |

To restore the demo data at any time: `npm run reset-data` (stop the servers first). This also clears uploaded files.

### Trying self check-in

1. Sign in as the professor, open **Attendance** and press **Start check-in**.
2. In another browser (or a private window), sign in as the student and open **Check in**.
3. Away from the MSIT campus, tick **Simulate being on campus**, or use **Use my location as campus** on the professor's side first so your real GPS position counts as campus.
4. Take a selfie and submit. Verified check-ins mark the student present; flagged ones (weak GPS, camera-app photo, simulated location) wait for the professor's approval.

## What is built

**Everyone:** sign-in by role, light and dark theme, notifications bell, announcements.

**Professor:** today's classes from the timetable, a roster with present or absent per student, a self check-in window with live selfie tiles and approve or reject, assignments with up to 5 attached files and a grading view, internal marks out of 25, the timetable, and leave and certificate requests for the section they coordinate.

**Student:** an attendance tracker per subject (trend line, how many classes can be missed, how many are needed to get back to 75%, a "what if I skip" simulator), alerts when a subject drops below the chosen threshold, self check-in (geofence plus stamped selfie), assignment submission with files, grades and SGPA history, timetable, exam date sheet with admit card and attendance clearance, study rooms on Google Meet for their own batch, shared notes and past papers with upvotes, library renewals and fines, fee payment and receipts, leave and certificate requests, and placement drives with eligibility checks.

**Parent:** a read-only view of their child's overview, attendance, assignments, grades, timetable, exams, library and leave, and can pay fees.

**Admin:** institute counts, enrollment by department, attendance over 8 weeks, live API and database health, an activity log, user management (add with a one-time password, suspend or activate) and courses.

Rules are enforced on the server, not just hidden in the UI: role checks on every route, students and parents only see their own records, the geofence distance is computed by the API, check-in only works while a window is open, placement eligibility and deadlines, library renewal limits, file type and size limits, and who can download each file.

## How it maps to the synopsis

| Synopsis                          | This build                                                                 |
|-----------------------------------|----------------------------------------------------------------------------|
| Next.js, TypeScript               | Yes (Next.js 14 App Router). Styling is plain CSS with design tokens       |
| NestJS                            | Yes (modules per feature, guards, validation pipes, file uploads)          |
| Prisma ORM                        | Yes                                                                        |
| PostgreSQL                        | Runs on SQLite for a zero-setup demo. Same Prisma schema, see below        |
| Keycloak (OIDC)                   | Not yet. Sign-in uses email or enrollment number, password and JWT. Roles are already enforced |
| Redis, Apache Kafka               | Not yet. Notifications are written by one service (`notify.service.ts`), the single place to publish events later |
| Docker, AWS                       | Not yet. Uploads live in `backend/uploads` behind `files.service.ts`, the one place to switch to S3 |
| Email and SMS alerts              | Not yet. Alerts go to the student's and parent's in-app notifications, plus optional browser desktop notifications |
| Payment gateway                   | Not yet. "Pay" records the payment directly and says so on screen          |

Be upfront about this in the demo: the features and four roles work end to end, and the infrastructure items above are the planned next steps.

### Switching to PostgreSQL

1. In `backend/prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. In `backend/.env`, set `DATABASE_URL` to your Postgres URL.
3. Run `npm run reset-data`.

## Checks

With the API running and fresh demo data (`npm run reset-data`), `npm run test:api` runs 75 end-to-end API checks covering sign-in, role protection, attendance and alerts, check-in, files, grading, study rooms, library, fees, leave, placements, announcements and admin. Run `npm run reset-data` again afterwards to get the demo data back.

## Structure

```
backend/    NestJS API (src/), Prisma schema and seed (prisma/), API checks (test/), uploaded files (uploads/)
frontend/   Next.js app (app/ pages, components/, lib/ for the API client, auth and formatting)
```
