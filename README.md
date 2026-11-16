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

### Deploying

Set `JWT_SECRET` in `backend/.env` to a random value of at least 32 characters, for example the output of `openssl rand -hex 32`. A built server (`npm --prefix backend run build` then `npm --prefix backend start`) or one started with `NODE_ENV=production` refuses to start without one, because anyone who knows the example secret could create sign-in tokens. The development server only prints a warning.

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

**Super admin (platform owner):** live subscribers by plan with search and filters, add a school (one-time password), renew or end a plan, and reset a school's password. There is no sign-up for this role: run `npm --prefix backend run make-superadmin -- <email>` on an existing account. `npm --prefix backend run seed-schools` adds two demo schools.

**Temporary passwords:** anyone given a one-time password (new users, new schools, password resets) must choose their own password before they can use the app. The demo accounts above are not affected.

Rules are enforced on the server, not just hidden in the UI: role checks on every route, students and parents only see their own records, the geofence distance is computed by the API, check-in only works while a window is open, placement eligibility and deadlines, library renewal limits, file type and size limits, and who can download each file.

## How it maps to the synopsis

| Synopsis                          | This build                                                                 |
|-----------------------------------|----------------------------------------------------------------------------|
| Next.js, TypeScript               | Yes (Next.js 14 App Router). Styling is plain CSS with design tokens       |
| NestJS                            | Yes (modules per feature, guards, validation pipes, file uploads)          |
| Prisma ORM                        | Yes                                                                        |
| PostgreSQL                        | Yes in Docker and CI. Local `npm run dev` uses SQLite for zero setup; the same schema is generated for PostgreSQL |
| Keycloak (OIDC)                   | Not yet. Sign-in uses email or enrollment number, password and JWT. Roles are already enforced |
| Redis                             | Yes when `REDIS_URL` is set (Docker, CI): caches the admin attendance chart and counts failed sign-ins (5 tries, then a 15-minute lock). Without it an in-memory cache is used |
| Apache Kafka                      | Not yet. Notifications are written by one service (`notify.service.ts`), the single place to publish events later |
| Docker, Docker Compose            | Yes: `docker compose up` runs PostgreSQL, Redis, the API and the web app (see below) |
| GitHub Actions                    | Yes: every push and pull request runs the API checks on PostgreSQL and Redis, builds the web app and the Docker images |
| AWS                               | Not yet. The live demo runs on Render (API) and Vercel (web). Uploads live behind `files.service.ts`, the one place to switch to S3 |
| Email and SMS alerts              | Not yet. Alerts go to the student's and parent's in-app notifications, plus optional browser desktop notifications |
| Payment gateway                   | Not yet. "Pay" records the payment directly and says so on screen          |

Be upfront about this in the demo: the features, roles, PostgreSQL, Redis, Docker and CI work end to end; Keycloak, Kafka, AWS, email/SMS and payments are the planned next steps.

### Running with Docker (PostgreSQL and Redis)

```bash
cp .env.docker.example .env        # then set JWT_SECRET, e.g. openssl rand -hex 32
docker compose up --build -d
docker compose run --rm api npm run db:seed      # demo data, first time only
```

Open http://localhost:3000. The admin's System health panel shows PostgreSQL and Redis with live round-trip times.

### PostgreSQL without Docker

Set `DATABASE_URL` to a Postgres URL in `backend/.env`, then run `npm --prefix backend run pg:generate` and `npm --prefix backend run pg:reset`. Edit only `prisma/schema.prisma`; the Postgres copy is generated from it.

## Checks

With the API running and fresh demo data (`npm run reset-data`), `npm run test:api` runs end-to-end API checks covering sign-in, role protection, attendance and alerts, check-in, files, grading, study rooms, library, fees, leave, placements, announcements, admin, and the super admin panel (including that school accounts cannot read any MSIT data). Run `npm run reset-data` again afterwards to get the demo data back.

## Structure

```
backend/    NestJS API (src/), Prisma schema and seed (prisma/), API checks (test/), uploaded files (uploads/)
frontend/   Next.js app (app/ pages, components/, lib/ for the API client, auth and formatting)
```
