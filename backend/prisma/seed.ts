/* Demo data for MSIT, section IT-1. Run through `npm run reset-data`, which wipes the database first. */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const UPLOAD_DIR = join(process.cwd(), 'uploads');

// Small deterministic generator so every seed produces the same demo data.
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const addDays = (n: number) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return iso(d); };
const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5);
const dayAt = (n: number, h: number, m = 0) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };

/** A one-page PDF with a title and lines of text, so seeded files open in the browser. */
function makePdf(title: string, lines: string[]) {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7E]/g, '-');
  const text = [`BT /F1 18 Tf 56 780 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 11 Tf 56 ${748 - i * 18} Td (${esc(l)}) Tj ET`)].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function pdfFile(uploaderId: string, name: string, title: string, lines: string[], extra: { assignmentId?: string } = {}) {
  const buf = makePdf(title, lines);
  const stored = randomBytes(12).toString('hex') + '.pdf';
  writeFileSync(join(UPLOAD_DIR, stored), buf);
  return prisma.fileAsset.create({ data: { name, size: buf.length, mime: 'application/pdf', path: stored, uploaderId, assignmentId: extra.assignmentId ?? null } });
}

/** Placeholder selfie for seeded check-ins (real ones are camera photos). */
function fakePhoto(name: string) {
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="hsl(${h} 35% 30%)"/><circle cx="80" cy="50" r="22" fill="hsl(${h} 30% 78%)"/><path d="M36 120c4-26 22-38 44-38s40 12 44 38z" fill="hsl(${h} 30% 78%)"/><rect y="100" width="160" height="20" fill="#000" opacity=".55"/><text x="6" y="113" font-family="monospace" font-size="8" fill="#fff">${name}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

async function main() {
  if (await prisma.user.count()) throw new Error('The database is not empty. Run `npm run reset-data` instead, which wipes it first.');
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const f of readdirSync(UPLOAD_DIR)) unlinkSync(join(UPLOAD_DIR, f));

  const hashes: Record<string, string> = {};
  for (const pw of ['admin123', 'prof123', 'student123', 'parent123']) hashes[pw] = await bcrypt.hash(pw, 10);
  const user = (name: string, email: string, role: string, pw: string, extra: object = {}) =>
    prisma.user.create({ data: { name, email, role, passwordHash: hashes[pw], ...extra } });

  // ---------- people ----------
  const admin = await user('Ritika Malhotra', 'admin@msit.edu', 'ADMIN', 'admin123');
  const fac = (name: string, email: string, dept: string, designation: string, status = 'ACTIVE') => user(name, email, 'TEACHER', 'prof123', { dept, designation, status });
  const neha = await fac('Dr. Neha Sharma', 'neha.sharma@msit.edu', 'IT', 'Assistant Professor');
  const rakesh = await fac('Prof. Rakesh Yadav', 'rakesh.yadav@msit.edu', 'IT', 'Professor');
  const pooja = await fac('Dr. Pooja Khanna', 'pooja.khanna@msit.edu', 'IT', 'Associate Professor');
  const shalini = await fac('Ms. Shalini Rao', 'shalini.rao@msit.edu', 'Humanities', 'Assistant Professor');
  await fac('Dr. Vikram Sethi', 'vikram.sethi@msit.edu', 'CSE', 'Associate Professor');
  await fac('Ms. Aditi Chawla', 'aditi.chawla@msit.edu', 'ECE', 'Assistant Professor', 'ON_LEAVE');
  const parent = await user('Sunil Goel', 'sunil.goel@parents.msit.edu', 'PARENT', 'parent123');

  const it1 = await prisma.classroom.create({ data: { name: 'IT-1', dept: 'IT', program: 'B.Tech IT', batch: '2023–27', semester: 5, feeDue: addDays(18), coordinatorId: neha.id } });

  const names = ['Garv Goel', 'Aryan Mishra', 'Abhishek Kumar', 'Ananya Verma', 'Ishaan Bansal', 'Kavya Arora', 'Rohan Sehgal', 'Priya Nair', 'Tanmay Jain', 'Simran Kaur', 'Harsh Vardhan', 'Mehak Gupta'];
  const serials = ['003', '009', '032', '011', '014', '017', '021', '024', '027', '035', '038', '041'];
  const students = [];
  for (let i = 0; i < names.length; i++) {
    const u = await user(names[i], `${names[i].split(' ')[0].toLowerCase()}${serials[i]}@msit.edu`, 'STUDENT', 'student123', {
      status: names[i] === 'Harsh Vardhan' ? 'SUSPENDED' : 'ACTIVE',
      createdAt: hoursAgo(24 * 400),
    });
    students.push(await prisma.student.create({
      data: { userId: u.id, rollNo: serials[i] + '15003123', classroomId: it1.id, parentId: i === 0 ? parent.id : null, backlogs: i === 6 ? 2 : 0 },
      include: { user: true },
    }));
  }
  const [garv] = students;
  const S = (name: string) => students.find((s) => s.user.name === name)!;

  // Other sections, so enrollment by department reflects the whole institute.
  const first = ['Aditya', 'Bhavya', 'Chirag', 'Divya', 'Eshan', 'Falguni', 'Gaurav', 'Hina', 'Jatin', 'Komal', 'Lakshay', 'Muskan', 'Naman', 'Ojasvi', 'Parth', 'Riya'];
  const last = ['Sharma', 'Singh', 'Gupta', 'Chopra', 'Malik', 'Bhatia', 'Saxena', 'Khurana', 'Ahuja', 'Rawat'];
  const sections: [string, string, string, number][] = [['IT-2', 'IT', 'B.Tech IT', 10], ['CSE-1', 'CSE', 'B.Tech CSE', 12], ['ECE-1', 'ECE', 'B.Tech ECE', 10], ['EEE-1', 'EEE', 'B.Tech EEE', 8], ['ME-1', 'ME', 'B.Tech ME', 6]];
  let serial = 101;
  for (const [name, dept, program, n] of sections) {
    const c = await prisma.classroom.create({ data: { name, dept, program } });
    for (let i = 0; i < n; i++, serial++) {
      const nm = `${first[Math.floor(rand() * first.length)]} ${last[Math.floor(rand() * last.length)]}`;
      const u = await user(nm, `${nm.split(' ')[0].toLowerCase()}${serial}@msit.edu`, 'STUDENT', 'student123', { createdAt: hoursAgo(24 * 400) });
      await prisma.student.create({ data: { userId: u.id, rollNo: `${serial}${dept === 'IT' ? '15003123' : '25003123'}`, classroomId: c.id } });
    }
  }

  // ---------- courses and timetable ----------
  const courseDefs: [string, string, string, number, number][] = [
    ['IT-301', 'Database Management Systems', neha.id, 4, 200],
    ['IT-303', 'Computer Networks', neha.id, 4, 265],
    ['IT-305', 'Web Technologies', neha.id, 3, 160],
    ['IT-307', 'Operating Systems', rakesh.id, 4, 30],
    ['IT-309', 'Software Engineering', pooja.id, 3, 330],
    ['HS-311', 'Technical Writing', shalini.id, 2, 5],
  ];
  const courses: Record<string, { id: string; code: string; name: string }> = {};
  for (const [code, name, teacherId, credits, hue] of courseDefs) {
    courses[code] = await prisma.course.create({ data: { code, name, teacherId, credits, hue, classroomId: it1.id } });
  }
  const TT: Record<number, ([string, string] | null)[]> = {
    1: [['IT-301', 'R-204'], ['IT-303', 'R-204'], ['IT-305', 'R-204'], null, ['IT-305', 'Lab 4'], ['IT-305', 'Lab 4']],
    2: [['IT-307', 'R-204'], ['IT-309', 'R-204'], ['IT-301', 'R-204'], ['HS-311', 'R-110'], ['IT-301', 'Lab 4'], ['IT-301', 'Lab 4']],
    3: [['IT-303', 'R-204'], ['IT-305', 'R-204'], ['IT-307', 'R-204'], ['IT-309', 'R-204'], null, null],
    4: [['IT-309', 'R-204'], ['IT-301', 'R-204'], ['IT-303', 'R-204'], null, ['IT-303', 'Lab 3'], ['IT-303', 'Lab 3']],
    5: [['IT-305', 'R-204'], ['IT-307', 'R-204'], ['HS-311', 'R-110'], ['IT-301', 'R-204'], null, null],
  };
  for (const [day, row] of Object.entries(TT)) {
    for (let slot = 0; slot < row.length; slot++) {
      const c = row[slot];
      if (c) await prisma.timetableSlot.create({ data: { courseId: courses[c[0]].id, day: Number(day), slot, room: c[1] } });
    }
  }

  // ---------- attendance: ten weeks of classes, one record per course per teaching day ----------
  const teachDays: Record<string, string[]> = {};
  for (let off = -70; off < 0; off++) {
    const d = new Date(TODAY); d.setDate(d.getDate() + off);
    const row = TT[d.getDay()];
    if (!row) continue;
    for (const code of new Set(row.filter(Boolean).map((c) => c![0]))) (teachDays[code] ??= []).push(iso(d));
  }
  // Garv's target percentages mirror the demo story: two subjects below 75%, one close to it.
  const garvTarget: Record<string, number> = { 'IT-301': 0.83, 'IT-303': 0.71, 'IT-305': 0.92, 'IT-307': 0.79, 'IT-309': 0.72, 'HS-311': 0.9 };
  const lowRisk: Record<string, Record<string, number>> = { 'Rohan Sehgal': { 'IT-303': 0.36 }, 'Tanmay Jain': { 'IT-301': 0.31 }, 'Simran Kaur': { 'IT-303': 0.27 } };
  const attendance = [];
  for (const [code, dates] of Object.entries(teachDays)) {
    const c = courses[code];
    await prisma.course.update({ where: { id: c.id }, data: { plannedClasses: Math.round(dates.length * 1.35) } });
    for (const s of students) {
      let absent = new Set<number>();
      if (s.id === garv.id) {
        // Absences lean towards recent weeks so the trend line dips.
        const n = dates.length - Math.round(dates.length * garvTarget[code]);
        while (absent.size < n) absent.add(Math.floor(Math.sqrt(rand()) * dates.length));
      } else {
        const p = lowRisk[s.user.name]?.[code] ?? 0.08;
        absent = new Set(dates.map((_, i) => i).filter(() => rand() < p));
      }
      dates.forEach((date, i) => attendance.push({ studentId: s.id, courseId: c.id, date, status: absent.has(i) ? 'ABSENT' : 'PRESENT' }));
    }
  }
  await prisma.attendance.createMany({ data: attendance });

  // Store each student's current level so alerts only fire on future changes.
  for (const s of students) {
    for (const c of Object.values(courses)) {
      const rows = attendance.filter((a) => a.studentId === s.id && a.courseId === c.id);
      const pct = (rows.filter((r) => r.status !== 'ABSENT').length / rows.length) * 100;
      await prisma.attendanceLevel.create({ data: { studentId: s.id, courseId: c.id, level: pct < 75 ? 'DANGER' : pct < 80 ? 'WARN' : 'OK' } });
    }
  }
  const pctFor = (code: string) => {
    const rows = attendance.filter((a) => a.studentId === garv.id && a.courseId === courses[code].id);
    return (rows.filter((r) => r.status !== 'ABSENT').length / rows.length) * 100;
  };
  for (const [code, level, h, read] of [['IT-307', 'WARN', 120, true], ['IT-309', 'DANGER', 48, false], ['IT-303', 'DANGER', 20, false]] as const) {
    await prisma.attendanceAlert.create({ data: { studentId: garv.id, courseId: courses[code].id, pct: pctFor(code), level, read, channels: 'In-app,Parent account', createdAt: hoursAgo(h) } });
  }

  // ---------- check-in ----------
  await prisma.campus.create({ data: { id: 'main', name: 'MSIT campus, Janakpuri', lat: 28.62095, lng: 77.09245, radius: 200 } });
  for (const [code, off, dist, acc, status, flags] of [['IT-305', -1, 64, 12, 'VERIFIED', ''], ['IT-303', -2, 118, 140, 'APPROVED', 'Weak GPS, ±140 m']] as const) {
    const date = addDays(off);
    const w = await prisma.checkWindow.create({ data: { courseId: courses[code].id, date, openedById: neha.id, openedAt: dayAt(off, 9, 15), until: dayAt(off, 9, 25) } });
    await prisma.checkIn.create({
      data: { windowId: w.id, studentId: garv.id, courseId: courses[code].id, date, dist, acc, method: 'LIVE', flags, status, photo: fakePhoto('Garv Goel'), createdAt: dayAt(off, 9, 18) },
    });
  }

  // ---------- marks and results ----------
  const fixed: Record<string, number> = { 'IT-301': 22, 'IT-303': 18, 'IT-305': 24, 'IT-307': 21, 'IT-309': 19, 'HS-311': 23 };
  const codes = Object.keys(courses);
  for (let i = 0; i < students.length; i++) {
    for (let ci = 0; ci < codes.length; ci++) {
      const marks = i === 0 ? fixed[codes[ci]] : 13 + ((i * 7 + ci * 5 + 3) % 12);
      await prisma.internalMark.create({ data: { studentId: students[i].id, courseId: courses[codes[ci]].id, marks } });
    }
    const sgpas = i === 0 ? [8.1, 8.4, 7.9, 8.6] : [0, 1, 2, 3].map(() => Math.round((6.4 + rand() * 2.9) * 10) / 10);
    for (let sem = 0; sem < 4; sem++) await prisma.semesterResult.create({ data: { studentId: students[i].id, semester: sem + 1, sgpa: sgpas[sem], credits: 22 } });
  }

  // ---------- exams ----------
  const examDefs: [number, string, string, string, string][] = [
    [13, 'IT-301', 'Units 1 and 2', 'R-204', 'A'], [14, 'IT-303', 'Units 1 and 2', 'R-205', 'B'], [15, 'IT-305', 'Unit 1 and first half of Unit 2', 'R-204', 'A'],
    [16, 'IT-307', 'Units 1 and 2', 'R-206', 'C'], [17, 'IT-309', 'Unit 1', 'R-205', 'B'], [20, 'HS-311', 'Units 1 and 2', 'R-110', 'D'],
  ];
  for (const [off, code, syllabus, room, row] of examDefs) {
    const e = await prisma.exam.create({ data: { courseId: courses[code].id, date: addDays(off), time: '10:00–11:30', syllabus, room } });
    await prisma.examSeat.createMany({ data: students.map((s, i) => ({ examId: e.id, studentId: s.id, seat: `${row}-${pad(i * 3 + 2 + off % 3)}` })) });
  }

  // ---------- assignments ----------
  const asg = async (code: string, title: string, description: string, dueOff: number, maxMarks: number) => {
    const due = dayAt(dueOff, 23, 59);
    return prisma.assignment.create({ data: { courseId: courses[code].id, title, description, dueDate: due, maxMarks, createdAt: dayAt(dueOff - 10, 11) } });
  };
  const a1 = await asg('IT-303', 'Subnetting problem set', 'Solve all 12 questions. Show the subnet mask, network address and host range for each.', 3, 10);
  await pdfFile(neha.id, 'subnetting_questions.pdf', 'IT-303 Subnetting problem set', [
    '1. Split 192.168.10.0/24 into 6 subnets. Give the mask and host range of each.',
    '2. How many usable hosts does a /27 network have?',
    '3. Find the network and broadcast address of 172.16.45.200/20.',
    '4. Design a VLSM plan for 4 LANs of 60, 28, 12 and 2 hosts from 10.1.0.0/24.',
    'Submit a single PDF. Due in class week 9.',
  ], { assignmentId: a1.id });
  const a2 = await asg('IT-305', 'Build a REST API with NestJS and Prisma', 'Expose CRUD endpoints for a library schema with validation and a seed script.', 9, 20);
  const a3 = await asg('IT-301', 'ER diagram for a hostel management system', 'Draw the ER diagram and map it to relational tables with keys.', 6, 10);
  await asg('IT-307', 'CPU scheduling simulator', 'Simulate FCFS, SJF, round robin and priority scheduling and print Gantt charts.', 13, 15);
  const a5 = await asg('IT-301', 'Normalization worksheet, 1NF to BCNF', 'Normalise the five given relations step by step to BCNF.', -4, 10);
  const a6 = await asg('IT-309', 'Software requirements specification draft', 'Write an IEEE 830 style SRS for your minor project.', -2, 10);

  const submit = async (a: { id: string; title: string }, s: (typeof students)[number], daysAgo: number, marks?: number, feedback?: string) => {
    const file = await pdfFile(s.userId, `${a.title.split(' ')[0].toLowerCase()}_${s.user.name.split(' ')[0].toLowerCase()}.pdf`, a.title, [`Submitted by ${s.user.name} (${s.rollNo})`, 'Answers attached on the following pages.']);
    await prisma.submission.create({
      data: { assignmentId: a.id, studentId: s.id, fileId: file.id, submittedAt: hoursAgo(daysAgo * 24), ...(marks !== undefined ? { marks, feedback: feedback ?? null, gradedAt: hoursAgo(daysAgo * 24 - 30) } : {}) },
    });
  };
  for (const i of [1, 3, 5, 7, 9, 11, 2, 4]) await submit(a1, students[i], 1);
  for (const i of [2, 4, 8]) await submit(a2, students[i], 1);
  for (const i of [3, 5, 7, 11, 1]) await submit(a3, students[i], 2);
  await submit(a5, garv, 6, 9, 'Clean decomposition. Show the dependency preservation check next time.');
  for (const i of [1, 2, 3, 4, 5, 7, 8, 9, 11]) await submit(a5, students[i], 5 + (i % 3), 6 + (i % 5), 'Good work.');
  for (const i of [0, 1, 3, 5, 7, 9, 11]) await submit(a6, students[i], 3);

  // ---------- study rooms ----------
  const study = async (title: string, code: string, host: string, start: Date, durationMin: number, link: string, capacity: number, going: string[], description: string) =>
    prisma.studySession.create({
      data: {
        title, description, courseId: courses[code].id, classroomId: it1.id, hostId: S(host).id, start, durationMin, link, capacity,
        rsvps: { create: [host, ...going].map((n) => ({ studentId: S(n).id })) },
      },
    });
  const soon = new Date(Math.ceil((Date.now() + 150 * 6e4) / 9e5) * 9e5);
  await study('DBMS normalization doubt-clearing', 'IT-301', 'Ananya Verma', new Date(Date.now() - 20 * 6e4), 90, 'https://meet.google.com/qwe-rtyu-iop', 12, ['Aryan Mishra', 'Priya Nair', 'Mehak Gupta'], 'Bring your doubts from the worksheet. We will decompose schemas into 3NF and BCNF together.');
  await study('Subnetting practice before the deadline', 'IT-303', 'Aryan Mishra', soon, 60, 'https://meet.google.com/kfp-mzqa-wbe', 8, ['Abhishek Kumar'], 'Going through the problem set one question each. Cameras optional.');
  await study('NestJS and Prisma REST API build-along', 'IT-305', 'Garv Goel', dayAt(1, 18, 30), 120, 'https://meet.google.com/hvn-trwx-cqs', 10, ['Abhishek Kumar', 'Ishaan Bansal', 'Tanmay Jain', 'Simran Kaur'], 'Screen-sharing our minor project setup. Good prep for the Web Tech assignment.');
  await study('OS mid-sem: scheduling algorithms marathon', 'IT-307', 'Kavya Arora', dayAt(3, 17, 0), 90, 'https://meet.google.com/bzs-yklo-ruf', 15, ['Rohan Sehgal'], "FCFS, SJF, round robin and priority with Gantt charts. We will time ourselves on last year's paper.");

  // ---------- notes and past papers ----------
  const res = async (title: string, code: string, type: string, by: string, daysAgo: number, voters: number, lines: string[], byLabel?: string) => {
    const uploader = S(by);
    const file = await pdfFile(uploader.userId, title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '.pdf', title, lines);
    const r = await prisma.resource.create({ data: { title, type, courseId: courses[code].id, uploaderId: uploader.userId, byLabel: byLabel ?? null, fileId: file.id, createdAt: hoursAgo(daysAgo * 24) } });
    await prisma.resourceVote.createMany({ data: students.slice(1, 1 + voters).map((s) => ({ resourceId: r.id, userId: s.userId })) });
  };
  await res('DBMS unit 3 handwritten notes: normalization', 'IT-301', 'NOTES', 'Ananya Verma', 3, 7, ['Functional dependencies and closures', '1NF, 2NF, 3NF and BCNF with examples', 'Lossless join and dependency preservation']);
  await res('Computer Networks mid-sem paper 2025', 'IT-303', 'PYQ', 'Ishaan Bansal', 9, 10, ['Q1. Compare TCP and UDP. (5)', 'Q2. Subnet 10.0.0.0/8 into 2000 subnets. (10)', 'Q3. Explain sliding window protocol. (10)'], 'Class representative');
  await res('OS end-sem papers 2022 to 2025 with solutions', 'IT-307', 'PYQ', 'Kavya Arora', 20, 11, ['2022, 2023, 2024 and 2025 papers', 'Worked solutions for every scheduling question']);
  await res('Next.js and Tailwind cheat sheet', 'IT-305', 'NOTES', 'Garv Goel', 6, 5, ['App Router file conventions', 'Server and client components', 'Common Tailwind utilities']);
  await res('Software Engineering: every UML diagram with examples', 'IT-309', 'NOTES', 'Priya Nair', 12, 4, ['Use case, class, sequence, activity and state diagrams', 'One worked example for each']);

  // ---------- library, fees, leave, certificates, placements ----------
  await prisma.bookIssue.createMany({
    data: [
      { studentId: garv.id, title: 'Database System Concepts', author: 'Silberschatz, Korth and Sudarshan', issuedOn: addDays(-10), dueOn: addDays(4), renewals: 0 },
      { studentId: garv.id, title: 'Computer Networking: A Top-Down Approach', author: 'Kurose and Ross', issuedOn: addDays(-31), dueOn: addDays(-3), renewals: 1 },
      { studentId: garv.id, title: 'Operating System Concepts', author: 'Silberschatz, Galvin and Gagne', issuedOn: addDays(-17), dueOn: addDays(11), renewals: 2 },
    ],
  });
  await prisma.feeItem.createMany({
    data: [['Tuition fee', 60000], ['Development fee', 9000], ['Examination fee', 2500], ['Library and lab fee', 3500]].map(([label, amount]) => ({ classroomId: it1.id, label: label as string, amount: amount as number })),
  });
  await prisma.payment.create({ data: { studentId: garv.id, txn: 'TXN8F3K21Q', amount: 50000, method: 'UPI', paidBy: 'Sunil Goel', createdAt: hoursAgo(40 * 24) } });

  const sih = await pdfFile(garv.userId, 'sih_participation_letter.pdf', 'Smart India Hackathon, internal round', ['This is to certify that Garv Goel represented MSIT.']);
  const med = await pdfFile(garv.userId, 'medical_certificate.pdf', 'Medical certificate', ['Patient: Garv Goel', 'Diagnosis: viral fever', 'Advised rest for three days.']);
  const dis = await pdfFile(S('Rohan Sehgal').userId, 'discharge_summary.pdf', 'Discharge summary', ['Patient: Rohan Sehgal', 'Admitted for dengue, discharged after two days.']);
  const leave = (s: (typeof students)[number], type: string, from: number, to: number, reason: string, fileId: string | null, status: string, h: number) =>
    prisma.leaveRequest.create({ data: { studentId: s.id, type, from: addDays(from), to: addDays(to), reason, fileId, status, decidedBy: status === 'PENDING' ? null : neha.name, createdAt: hoursAgo(h) } });
  await leave(garv, 'Duty leave (event, sports, hackathon)', -15, -14, 'Represented MSIT at the Smart India Hackathon internal round.', sih.id, 'APPROVED', 16 * 24);
  await leave(garv, 'Medical leave', -8, -6, 'Viral fever, advised three days of rest.', med.id, 'PENDING', 5 * 24);
  await leave(S('Rohan Sehgal'), 'Medical leave', -5, -3, 'Dengue, admitted to hospital for two days.', dis.id, 'PENDING', 2 * 24);
  await leave(S('Simran Kaur'), 'Personal leave', 2, 3, "Sister's wedding in Amritsar.", null, 'PENDING', 10);
  await prisma.certificateRequest.create({ data: { studentId: garv.id, type: 'Bonafide certificate', purpose: 'scholarship bank account', status: 'READY', createdAt: hoursAgo(4 * 24) } });
  await prisma.certificateRequest.create({ data: { studentId: S('Priya Nair').id, type: 'NOC for internship', purpose: 'summer internship at a startup', createdAt: hoursAgo(30) } });

  await prisma.drive.createMany({
    data: [
      { company: 'ByteHarbor', role: 'Backend Engineering Intern', pkg: '₹50,000 per month stipend', type: 'Internship', minCgpa: 8.0, maxBacklogs: 0, deadline: addDays(5) },
      { company: 'Quantaloop', role: 'Product Development Intern', pkg: '₹1,00,000 per month stipend', type: 'Internship', minCgpa: 8.5, maxBacklogs: 0, deadline: addDays(3) },
      { company: 'Finlytics', role: 'Data Analyst Intern', pkg: '₹30,000 per month stipend', type: 'Internship', minCgpa: 7.0, maxBacklogs: 1, deadline: addDays(9) },
      { company: 'Nimbus Cloud', role: 'Summer Research Intern', pkg: '₹25,000 per month stipend', type: 'Summer 2027', minCgpa: 6.5, maxBacklogs: 1, deadline: addDays(-1) },
    ],
  });

  // ---------- announcements, notifications, activity ----------
  const ann = (title: string, body: string, audience: string, authorId: string, h: number, extra: { byLabel?: string; courseId?: string } = {}) =>
    prisma.announcement.create({ data: { title, body, audience, authorId, createdAt: hoursAgo(h), byLabel: extra.byLabel ?? null, courseId: extra.courseId ?? null } });
  const examStart = new Date(TODAY); examStart.setDate(examStart.getDate() + 13);
  await ann(`Mid-semester exams begin ${examStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`, 'The date sheet is on the notice board and on the Exams page. Bring your ID card to every paper; entry closes 15 minutes after the start.', 'ALL', admin.id, 5, { byLabel: 'Examination Cell' });
  await ann('DBMS lab moved to Lab 4', 'From this week the Tuesday DBMS lab runs in Lab 4 on the second floor. Bring your lab file for the SQL joins practical.', 'COURSE', neha.id, 26, { courseId: courses['IT-301'].id });
  await ann('Self check-in is live', 'Professors can now open a short check-in window in class. Mark yourself present from your phone while you are on campus.', 'ALL', admin.id, 72, { byLabel: 'IT Services' });
  await ann('Faculty meeting on NAAC documentation', 'All faculty to meet in the Seminar Hall on Friday at 3:00 pm. Bring course files for the odd semester.', 'TEACHER', admin.id, 48, { byLabel: "Director's Office" });
  await ann('Hackathon registrations are open', 'Teams of up to four can register for the 24-hour inter-college hackathon through the Student Council page.', 'STUDENT', admin.id, 96, { byLabel: 'Student Council' });
  await ann('Parent-teacher meeting', 'The parent-teacher meeting for semester 5 is on the first Saturday of next month, 10 am to 1 pm, in the Seminar Hall.', 'PARENT', admin.id, 60);

  const note = (userId: string, title: string, body: string, link: string, h: number, read = false, kind = 'INFO') =>
    prisma.notification.create({ data: { userId, title, body, link, read, kind, createdAt: hoursAgo(h) } });
  await note(neha.id, '8 new submissions', '"Subnetting problem set" in IT-303 is ready for grading.', '/assignments', 0.4);
  await note(neha.id, 'Question papers due', 'Mid-semester question papers are due to the exam cell this week.', '/announcements', 3);
  await note(neha.id, 'Leave request from Simran Kaur', 'Personal leave, 2 days.', '/leaves', 10);
  await note(garv.userId, 'Internal marks updated for Computer Networks', 'IT-303 internal assessment, out of 25.', '/grades', 1);
  await note(garv.userId, 'Attendance warning', `Computer Networks fell below 75% (${pctFor('IT-303').toFixed(1)}%). Attend upcoming classes to stay eligible for exams.`, '/attendance', 20, false, 'WARN');
  await note(garv.userId, '"Subnetting problem set" is due in 3 days', 'IT-303, 10 marks.', '/assignments', 5);
  await note(parent.id, 'Attendance: Garv Goel', `Computer Networks fell below 75% (${pctFor('IT-303').toFixed(1)}%).`, '/attendance', 20, false, 'WARN');
  await note(admin.id, 'Faculty on leave', 'Ms. Aditi Chawla is on leave until next month.', '/users', 30, true);

  const act = (text: string, h: number) => prisma.activity.create({ data: { text, createdAt: hoursAgo(h) } });
  await act("Harsh Vardhan's account was suspended", 26);
  await act('Examination Cell posted the mid-semester date sheet', 5);
  await act('Dr. Neha Sharma opened self check-in for IT-305', 2);
  await act('Garv Goel checked in to IT-305 (verified)', 1.9);
  await act('Dr. Neha Sharma saved attendance for IT-301 (11 of 12 present)', 0.2);

  console.log('Seeded. Sign in with admin@msit.edu / admin123, neha.sharma@msit.edu / prof123, 00315003123 / student123 or sunil.goel@parents.msit.edu / parent123.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
