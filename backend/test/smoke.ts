/* End-to-end API check. Run with the server up: npm run test:api */
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let failed = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { failed++; if (extra !== undefined) console.log('      ', JSON.stringify(extra).slice(0, 300)); }
}
const login = async (email: string) => (await call('POST', '/auth/login', undefined, { email, password: 'campus123' })).data;

async function main() {
  // Auth
  const bad = await call('POST', '/auth/login', undefined, { email: 'admin@campusone.test', password: 'wrong' });
  check('bad password is rejected (401)', bad.status === 401, bad);
  const noAuth = await call('GET', '/dashboard');
  check('no token is rejected (401)', noAuth.status === 401, noAuth);

  const admin = await login('admin@campusone.test');
  const anita = await login('anita.rao@campusone.test');
  const vikram = await login('vikram.sethi@campusone.test');
  const aarav = await login('aarav.malhotra@campusone.test');
  const kavita = await login('kavita.nair@campusone.test');
  check('logins work for all roles', [admin, anita, vikram, aarav, kavita].every((x) => x?.token));
  check('parent sees two children', kavita.students.length === 2, kavita.students);

  // Dashboards
  const dAdmin = await call('GET', '/dashboard', admin.token);
  check('admin dashboard has counts', dAdmin.data?.counts?.students === 8, dAdmin.data);
  const dTeacher = await call('GET', '/dashboard', anita.token);
  check('teacher dashboard lists 2 courses', dTeacher.data?.courses?.length === 2, dTeacher.data);
  const dStudent = await call('GET', '/dashboard', aarav.token);
  check('student dashboard has attendance %', typeof dStudent.data?.attendanceOverall === 'number', dStudent.data);

  // Role protection
  const forbidden = await call('GET', '/people', aarav.token);
  check('student cannot list people (403)', forbidden.status === 403, forbidden);
  const otherChild = await call('GET', `/attendance/summary?studentId=${aarav.students[0].id}`, kavita.token);
  check('parent cannot view another family\'s child (403)', otherChild.status === 403, otherChild);
  const ownChild = await call('GET', `/attendance/summary?studentId=${kavita.students[1].id}`, kavita.token);
  check('parent can view own child', ownChild.status === 200 && ownChild.data.courses.length === 4, ownChild);

  // Attendance: teacher takes attendance for today
  const courses = (await call('GET', '/courses', anita.token)).data;
  const cs201 = courses.find((c: any) => c.code === 'CS201');
  const today = new Date().toLocaleDateString('en-CA');
  const roster = await call('GET', `/attendance/roster?courseId=${cs201.id}&date=${today}`, anita.token);
  check('roster has 8 students, none marked yet', roster.data?.length === 8 && roster.data.every((r: any) => r.status === null), roster);
  const records = roster.data.map((r: any, i: number) => ({ studentId: r.studentId, status: i === 0 ? 'ABSENT' : 'PRESENT' }));
  const mark = await call('POST', '/attendance/mark', anita.token, { courseId: cs201.id, date: today, records });
  check('attendance saved', mark.status === 201 && mark.data.saved === 8, mark);
  const roster2 = await call('GET', `/attendance/roster?courseId=${cs201.id}&date=${today}`, anita.token);
  check('saved statuses come back', roster2.data.filter((r: any) => r.status === 'PRESENT').length === 7, roster2.data);
  const notifs = await call('GET', '/notifications', aarav.token);
  check('absent student got a notification', notifs.data.items.some((n: any) => n.title.includes('absent')), notifs.data);
  const future = await call('POST', '/attendance/mark', anita.token, { courseId: cs201.id, date: '2999-01-01', records });
  check('future date is rejected (400)', future.status === 400, future);
  const vikramCourse = (await call('GET', '/courses', vikram.token)).data[0];
  const wrong = await call('GET', `/attendance/roster?courseId=${vikramCourse.id}&date=${today}`, anita.token);
  check('teacher cannot open another teacher\'s course (403)', wrong.status === 403, wrong);

  // Assignments: create -> student submits -> teacher grades
  const due = new Date(Date.now() + 5 * 86400000).toISOString();
  const created = await call('POST', '/assignments', anita.token, { courseId: cs201.id, title: 'Stack and queue', description: 'Implement both with arrays.', dueDate: due, maxMarks: 10 });
  check('teacher creates assignment', created.status === 201, created);
  const list = await call('GET', '/assignments', aarav.token);
  const mine = list.data.find((a: any) => a.title === 'Stack and queue');
  check('student sees the new assignment, not submitted', mine && mine.submission === null, list.data?.length);
  const empty = await call('POST', `/assignments/${mine.id}/submit`, aarav.token, { content: '' });
  check('empty submission rejected (400)', empty.status === 400, empty);
  const sub = await call('POST', `/assignments/${mine.id}/submit`, aarav.token, { content: 'Array-based stack and circular queue.' });
  check('student submits', sub.status === 201 && sub.data.id, sub);
  const teacherSees = await call('GET', `/assignments/${mine.id}/submissions`, anita.token);
  const row = teacherSees.data.rows.find((r: any) => r.submission);
  check('teacher sees the submission', !!row && teacherSees.data.rows.length === 8, teacherSees.data);
  const tooHigh = await call('POST', `/submissions/${row.submission.id}/grade`, anita.token, { marks: 11 });
  check('marks above max rejected (400)', tooHigh.status === 400, tooHigh);
  const graded = await call('POST', `/submissions/${row.submission.id}/grade`, anita.token, { marks: 9, feedback: 'Neat.' });
  check('teacher grades', graded.status === 201 && graded.data.marks === 9, graded);
  const resubmit = await call('POST', `/assignments/${mine.id}/submit`, aarav.token, { content: 'changed' });
  check('graded work cannot be resubmitted (403)', resubmit.status === 403, resubmit);
  const grades = await call('GET', '/grades', aarav.token);
  check('grades page includes new mark', grades.data.courses.find((c: any) => c.code === 'CS201').items.some((i: any) => i.title === 'Stack and queue'), grades.data);
  const parentGrades = await call('GET', `/grades?studentId=${aarav.students[0].id}`, (await login('suresh.malhotra@campusone.test')).token);
  check('parent can see child grades', parentGrades.status === 200, parentGrades);

  // Announcements + notifications
  const post = await call('POST', '/announcements', admin.token, { title: 'Library timings', body: 'The library is open till 8 pm this week.', audience: 'STUDENT' });
  check('admin posts announcement', post.status === 201, post);
  const studentFeed = await call('GET', '/announcements', aarav.token);
  const parentFeed = await call('GET', '/announcements', kavita.token);
  check('students see student announcement', studentFeed.data.some((a: any) => a.title === 'Library timings'));
  check('parents do not see student-only announcement', !parentFeed.data.some((a: any) => a.title === 'Library timings'));
  const studentPost = await call('POST', '/announcements', aarav.token, { title: 'Hello all', body: 'test', audience: 'ALL' });
  check('student cannot post announcement (403)', studentPost.status === 403, studentPost);
  const n1 = await call('GET', '/notifications', aarav.token);
  check('student has unread notifications', n1.data.unread > 0, n1.data.unread);
  await call('POST', `/notifications/${n1.data.items[0].id}/read`, aarav.token);
  await call('POST', '/notifications/read-all', aarav.token);
  const n2 = await call('GET', '/notifications', aarav.token);
  check('mark all read works', n2.data.unread === 0, n2.data.unread);
  const del = await call('DELETE', `/announcements/${post.data.id}`, admin.token);
  check('admin deletes announcement', del.status === 200, del);

  // Admin people & classes
  const cls = await call('POST', '/classrooms', admin.token, { name: 'IT-3' });
  check('admin creates class', cls.status === 201, cls);
  const dupCls = await call('POST', '/classrooms', admin.token, { name: 'IT-3' });
  check('duplicate class rejected (400)', dupCls.status === 400, dupCls);
  const stu = await call('POST', '/people', admin.token, { role: 'STUDENT', name: 'Test Student', email: 'test.student@campusone.test', password: 'secret1', classroomId: cls.data.id, rollNo: 'IT3-001' });
  check('admin creates student', stu.status === 201, stu);
  const dupEmail = await call('POST', '/people', admin.token, { role: 'TEACHER', name: 'Dup', email: 'test.student@campusone.test', password: 'secret1' });
  check('duplicate email rejected (400)', dupEmail.status === 400, dupEmail);
  const teacherNew = await call('POST', '/people', admin.token, { role: 'TEACHER', name: 'Test Teacher', email: 'test.teacher@campusone.test', password: 'secret1' });
  const course = await call('POST', '/courses', admin.token, { code: 'TT101', name: 'Test Course', classroomId: cls.data.id, teacherId: teacherNew.data.id });
  check('admin creates course', course.status === 201, course);
  const delTeacher = await call('DELETE', `/people/${teacherNew.data.id}`, admin.token);
  check('teacher with courses cannot be deleted (400)', delTeacher.status === 400, delTeacher);
  const delStu = await call('DELETE', `/people/${stu.data.id}`, admin.token);
  check('admin deletes student', delStu.status === 200, delStu);
  const people = await call('GET', '/people?role=STUDENT', admin.token);
  check('people list filters by role', people.data.length === 8 && people.data.every((p: any) => p.role === 'STUDENT'), people.data?.length);

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
main();
