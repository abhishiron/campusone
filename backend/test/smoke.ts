/* End-to-end API checks. Run against freshly seeded data with the server up: npm run reset-data, then npm run test:api */
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let failed = 0, passed = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* binary file */ }
  return { status: res.status, data };
}
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (ok) passed++;
  else { failed++; if (extra !== undefined) console.log('      ', JSON.stringify(extra).slice(0, 300)); }
}
const login = async (identifier: string, password: string) => (await call('POST', '/auth/login', undefined, { identifier, password })).data;
const pdf = (name: string) => { const f = new FormData(); f.append('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), name); return f; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');

async function main() {
  // ---------- auth ----------
  check('bad password is rejected (401)', (await call('POST', '/auth/login', undefined, { identifier: 'admin@msit.edu', password: 'nope' })).status === 401);
  check('no token is rejected (401)', (await call('GET', '/dashboard')).status === 401);
  check('health is public', (await call('GET', '/health')).data?.ok === true);
  const admin = await login('admin@msit.edu', 'admin123');
  const neha = await login('neha.sharma@msit.edu', 'prof123');
  const garv = await login('00315003123', 'student123');
  const parent = await login('sunil.goel@parents.msit.edu', 'parent123');
  const aryan = await login('aryan009@msit.edu', 'student123');
  check('all four roles sign in (student by enrollment number)', [admin, neha, garv, parent, aryan].every((x) => x?.token), [admin, garv]);
  check('suspended student cannot sign in', (await call('POST', '/auth/login', undefined, { identifier: 'harsh038@msit.edu', password: 'student123' })).status === 401);
  check('parent is linked to Garv', parent.students?.[0]?.name === 'Garv Goel');

  // ---------- role protection ----------
  check('student cannot list users (403)', (await call('GET', '/people', garv.token)).status === 403);
  check('parent cannot open study rooms (403)', (await call('GET', '/study', parent.token)).status === 403);
  const others = (await call('GET', '/people?role=STUDENT&q=Aryan', admin.token)).data;
  check('admin search finds Aryan', others.length === 1, others);

  // ---------- dashboards ----------
  const dA = (await call('GET', '/dashboard', admin.token)).data;
  check('admin overview has enrollment and 8 weeks', dA.enrollment?.length >= 5 && dA.weeks?.length === 8, dA);
  const dT = (await call('GET', '/dashboard', neha.token)).data;
  check('professor overview lists 3 courses and low attendance', dT.courses?.length === 3 && dT.below?.length > 0, dT);
  check('admin health details', typeof (await call('GET', '/health/details', admin.token)).data?.dbMs === 'number');

  // ---------- attendance tracker ----------
  const sum = (await call('GET', '/attendance/summary', garv.token)).data;
  check('tracker shows IT-303 below 75%', sum.courses.find((c: any) => c.code === 'IT-303')?.level === 'DANGER', sum.courses);
  const parentSum = await call('GET', `/attendance/summary?studentId=${parent.students[0].id}`, parent.token);
  check('parent can view child attendance', parentSum.status === 200);
  check('bad warn threshold rejected (400)', (await call('PATCH', '/attendance/settings', garv.token, { warnAt: 99 })).status === 400);
  const s83 = await call('PATCH', '/attendance/settings', garv.token, { warnAt: 85 });
  check('raising the threshold fires a new warning for IT-301', s83.data?.fired?.some((f: any) => f.code === 'IT-301' && f.level === 'WARN'), s83.data);
  await call('PATCH', '/attendance/settings', garv.token, { warnAt: 80 });

  // ---------- professor takes attendance; Garv absent triggers alert flow ----------
  const courses = (await call('GET', '/courses', neha.token)).data;
  const it305 = courses.find((c: any) => c.code === 'IT-305');
  const roster = (await call('GET', `/attendance/roster?courseId=${it305.id}&date=${today()}`, neha.token)).data;
  check('roster lists active students only (11)', roster.rows.length === 11, roster.rows.length);
  const garvRow = roster.rows.find((r: any) => r.name === 'Garv Goel');
  const mark = await call('POST', '/attendance/mark', neha.token, { courseId: it305.id, date: today(), records: roster.rows.map((r: any) => ({ studentId: r.studentId, status: r === garvRow ? 'ABSENT' : 'PRESENT' })) });
  check('attendance saved', mark.status === 201 && mark.data.present === 10, mark.data);
  check('future date rejected (400)', (await call('POST', '/attendance/mark', neha.token, { courseId: it305.id, date: '2999-01-01', records: [{ studentId: garvRow.studentId, status: 'PRESENT' }] })).status === 400);
  const rakeshCourse = (await call('GET', '/courses', admin.token)).data.find((c: any) => c.code === 'IT-307');
  check('professor cannot open another professor\'s course (403)', (await call('GET', `/attendance/roster?courseId=${rakeshCourse.id}&date=${today()}`, neha.token)).status === 403);
  const gn = (await call('GET', '/notifications', garv.token)).data;
  check('absent student was notified', gn.items.some((n: any) => n.title === 'Marked absent in IT-305'), gn.items.slice(0, 3));

  // ---------- self check-in ----------
  check('no window: check-in refused (400)', (await call('POST', '/checkin', aryan.token, { lat: 28.62095, lng: 77.09245, acc: 10, method: 'LIVE', photo: PHOTO })).status === 400);
  const it303 = courses.find((c: any) => c.code === 'IT-303');
  const win = await call('POST', '/checkin/window', neha.token, { courseId: it303.id, minutes: 10 });
  check('professor opens a check-in window', win.status === 201, win.data);
  check('second window refused while one is open (400)', (await call('POST', '/checkin/window', neha.token, { courseId: it305.id, minutes: 5 })).status === 400);
  const cur = (await call('GET', '/checkin/current', aryan.token)).data;
  check('student sees the open window', cur.window?.code === 'IT-303', cur);
  check('outside the geofence refused (400)', (await call('POST', '/checkin', aryan.token, { lat: 28.70, lng: 77.20, acc: 10, method: 'LIVE', photo: PHOTO })).status === 400);
  const ok = await call('POST', '/checkin', aryan.token, { lat: 28.6211, lng: 77.0925, acc: 12, method: 'LIVE', photo: PHOTO });
  check('on-campus live check-in is verified', ok.data?.status === 'VERIFIED', ok.data);
  check('checking in twice refused (400)', (await call('POST', '/checkin', aryan.token, { lat: 28.6211, lng: 77.0925, acc: 12, method: 'LIVE', photo: PHOTO })).status === 400);
  const weak = await call('POST', '/checkin', garv.token, { lat: 28.6211, lng: 77.0925, acc: 160, method: 'UPLOAD', photo: PHOTO });
  check('weak GPS + uploaded photo needs review', weak.data?.status === 'NEEDS_REVIEW' && weak.data.flags.length === 2, weak.data);
  const ros2 = (await call('GET', `/attendance/roster?courseId=${it303.id}&date=${today()}`, neha.token)).data;
  check('verified check-in marks the student present', ros2.rows.find((r: any) => r.name === 'Aryan Mishra')?.status === 'PRESENT', ros2.rows);
  const approve = await call('POST', `/checkin/${weak.data.id}/decide`, neha.token, { status: 'APPROVED' });
  check('professor approves a flagged check-in', approve.status === 201);
  await call('POST', `/checkin/window/${win.data.id}/close`, neha.token);
  check('closed window no longer shown', (await call('GET', '/checkin/current', aryan.token)).data.window === null);

  // ---------- assignments with files ----------
  const form = new FormData();
  form.append('courseId', it305.id); form.append('title', 'Smoke test assignment'); form.append('due', today()); form.append('maxMarks', '10');
  form.append('files', new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), 'brief.pdf');
  const created = await call('POST', '/assignments', neha.token, form);
  check('professor creates assignment with attachment', created.status === 201 && created.data.files === 1, created.data);
  const exe = new FormData(); exe.append('file', new Blob(['MZ'], { type: 'application/octet-stream' }), 'virus.exe');
  check('disallowed file type rejected (400)', (await call('POST', `/assignments/${created.data.id}/submit`, garv.token, exe)).status === 400);
  const sub = await call('POST', `/assignments/${created.data.id}/submit`, garv.token, pdf('answer.pdf'));
  check('student submits a file', sub.status === 201 && sub.data.file?.name === 'answer.pdf', sub.data);
  check('student downloads own submission', (await call('GET', `/files/${sub.data.file.id}`, garv.token)).status === 200);
  check('classmate cannot download it (403)', (await call('GET', `/files/${sub.data.file.id}`, aryan.token)).status === 403);
  const subs = (await call('GET', `/assignments/${created.data.id}/submissions`, neha.token)).data;
  const row = subs.rows.find((r: any) => r.submission);
  check('marks above max rejected (400)', (await call('POST', `/submissions/${row.submission.id}/grade`, neha.token, { marks: 11 })).status === 400);
  check('professor grades', (await call('POST', `/submissions/${row.submission.id}/grade`, neha.token, { marks: 9, feedback: 'Neat.' })).data?.marks === 9);
  check('graded work cannot be resubmitted (403)', (await call('POST', `/assignments/${created.data.id}/submit`, garv.token, pdf('again.pdf'))).status === 403);

  // ---------- internal marks ----------
  const cm = (await call('GET', `/grades/class?courseId=${it305.id}`, neha.token)).data;
  check('internal marks over 25 rejected (400)', (await call('PUT', '/grades/class', neha.token, { courseId: it305.id, marks: [{ studentId: cm.rows[0].studentId, marks: 30 }] })).status === 400);
  const saved = await call('PUT', '/grades/class', neha.token, { courseId: it305.id, marks: [{ studentId: cm.rows[0].studentId, marks: 20 }] });
  check('internal marks saved', saved.status === 200, saved.data);
  const g = (await call('GET', '/grades', garv.token)).data;
  check('student grades include CGPA and assignment mark', g.cgpa > 8 && g.assignments.some((a: any) => a.title === 'Smoke test assignment'), g);

  // ---------- study rooms ----------
  const start = new Date(Date.now() + 3 * 3600e3).toISOString();
  check('bad Meet link rejected (400)', (await call('POST', '/study', garv.token, { title: 'Test', course: 'GEN', start, durationMin: 60, capacity: 5, link: 'https://zoom.us/j/1' })).status === 400);
  const sess = await call('POST', '/study', garv.token, { title: 'Smoke session', course: 'GEN', start, durationMin: 60, capacity: 2, link: 'meet.google.com/abc-defg-hij?x=1' });
  check('student hosts a session (link normalised)', sess.status === 201 && sess.data.link === 'https://meet.google.com/abc-defg-hij', sess.data);
  check('duplicate upcoming link rejected (400)', (await call('POST', '/study', aryan.token, { title: 'Dup', course: 'GEN', start, durationMin: 60, capacity: 5, link: 'https://meet.google.com/abc-defg-hij' })).status === 400);
  check('classmate RSVPs', (await call('POST', `/study/${sess.data.id}/rsvp`, aryan.token)).data?.going === true);
  const ananya = await login('ananya011@msit.edu', 'student123');
  check('full session refuses more (400)', (await call('POST', `/study/${sess.data.id}/rsvp`, ananya.token)).status === 400);
  check('only the host can cancel (403)', (await call('DELETE', `/study/${sess.data.id}`, aryan.token)).status === 403);
  check('host cancels', (await call('DELETE', `/study/${sess.data.id}`, garv.token)).status === 200);

  // ---------- notes, library, fees ----------
  const share = pdf('notes.pdf'); share.append('title', 'Smoke notes'); share.append('courseId', it305.id); share.append('type', 'NOTES');
  const res = await call('POST', '/resources', garv.token, share);
  check('student shares notes', res.status === 201);
  check('classmate upvotes', (await call('POST', `/resources/${res.data.id}/vote`, aryan.token)).data?.voted === true);
  check('classmate can open shared notes', (await call('GET', `/files/${res.data.fileId}`, aryan.token)).status === 200);
  const lib = (await call('GET', '/library', garv.token)).data;
  const overdue = lib.books.find((b: any) => b.daysLeft < 0), maxed = lib.books.find((b: any) => b.renewals >= 2), fine = lib.books.find((b: any) => b.daysLeft >= 0 && b.renewals < 2);
  check('overdue book cannot be renewed (400)', (await call('POST', `/library/${overdue.id}/renew`, garv.token)).status === 400);
  check('renewal limit enforced (400)', (await call('POST', `/library/${maxed.id}/renew`, garv.token)).status === 400);
  check('renewal works', (await call('POST', `/library/${fine.id}/renew`, garv.token)).data?.renewals === 1);
  const pay = await call('POST', '/fees/pay', parent.token, { method: 'UPI', studentId: parent.students[0].id });
  check('parent pays the fee balance', pay.status === 201 && pay.data.amount === 25000, pay.data);
  check('nothing left to pay (400)', (await call('POST', '/fees/pay', garv.token, { method: 'UPI' })).status === 400);

  // ---------- leave and certificates ----------
  const lv = new FormData(); lv.append('type', 'Medical leave'); lv.append('from', '2026-01-01'); lv.append('to', '2026-01-05'); lv.append('reason', 'Fever');
  check('long medical leave without proof rejected (400)', (await call('POST', '/leaves', garv.token, lv)).status === 400);
  const lv2 = pdf('certificate.pdf'); lv2.append('type', 'Medical leave'); lv2.append('from', '2026-01-01'); lv2.append('to', '2026-01-05'); lv2.append('reason', 'Fever');
  const leave = await call('POST', '/leaves', garv.token, lv2);
  check('medical leave with proof accepted', leave.status === 201);
  check('coordinator approves', (await call('POST', `/leaves/${leave.data.id}/decide`, neha.token, { status: 'APPROVED' })).status === 201);
  const pooja = await login('pooja.khanna@msit.edu', 'prof123');
  const cert = await call('POST', '/certificates', garv.token, { type: 'Bonafide certificate', purpose: 'passport' });
  check('non-coordinator cannot mark certificate ready (403)', (await call('POST', `/certificates/${cert.data.id}/ready`, pooja.token)).status === 403);
  check('coordinator marks certificate ready', (await call('POST', `/certificates/${cert.data.id}/ready`, neha.token)).status === 201);

  // ---------- placements ----------
  const drives = (await call('GET', '/placements', garv.token)).data.drives;
  const byName = (n: string) => drives.find((d: any) => d.company === n);
  check('CGPA below cut-off cannot register (400)', (await call('POST', `/placements/${byName('Quantaloop').id}/register`, garv.token)).status === 400);
  check('closed drive cannot register (400)', (await call('POST', `/placements/${byName('Nimbus Cloud').id}/register`, garv.token)).status === 400);
  check('eligible drive registers', (await call('POST', `/placements/${byName('ByteHarbor').id}/register`, garv.token)).data?.registered === true);

  // ---------- announcements and admin ----------
  const ann = await call('POST', '/announcements', neha.token, { title: 'Quiz on Friday', body: 'Unit 2 quiz.', audience: it305.id });
  check('professor posts to own course', ann.status === 201);
  check('professor cannot post to another course (403)', (await call('POST', '/announcements', neha.token, { title: 'Wrong course', body: 'Body text', audience: rakeshCourse.id })).status === 403);
  check('student in the course sees it', (await call('GET', '/announcements', garv.token)).data.some((a: any) => a.title === 'Quiz on Friday'));
  check('faculty-only notice hidden from students', !(await call('GET', '/announcements', garv.token)).data.some((a: any) => a.title.startsWith('Faculty meeting')));
  const nu = await call('POST', '/people', admin.token, { role: 'STUDENT', name: 'Test Student', email: 'test.student@msit.edu', dept: 'CSE' });
  check('admin adds a student with a temporary password', nu.status === 201 && !!nu.data.tempPassword && !!nu.data.rollNo, nu.data);
  check('new student can sign in', !!(await login(nu.data.rollNo, nu.data.tempPassword))?.token);
  check('duplicate email rejected (400)', (await call('POST', '/people', admin.token, { role: 'TEACHER', name: 'Dup', email: 'test.student@msit.edu', dept: 'IT' })).status === 400);
  check('admin suspends the account', (await call('PATCH', `/people/${nu.data.id}/status`, admin.token, { status: 'SUSPENDED' })).status === 200);
  check('suspended account is locked out', (await call('POST', '/auth/login', undefined, { identifier: nu.data.rollNo, password: nu.data.tempPassword })).status === 401);

  console.log(failed ? `\n${failed} of ${passed + failed} checks FAILED` : `\nAll ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
