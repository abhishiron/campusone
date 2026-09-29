import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'campus123';

// Small deterministic generator so every seed produces the same demo data.
let seedState = 42;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};

const day = (offset: number, hour = 17) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const ymd = (d: Date) => d.toLocaleDateString('en-CA');

async function main() {
  await prisma.notification.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.course.deleteMany();
  await prisma.student.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = (name: string, email: string, role: string) =>
    prisma.user.create({ data: { name, email, role, passwordHash } });

  const admin = await user('Neha Kulkarni', 'admin@campusone.test', 'ADMIN');
  const anita = await user('Dr. Anita Rao', 'anita.rao@campusone.test', 'TEACHER');
  const vikram = await user('Prof. Vikram Sethi', 'vikram.sethi@campusone.test', 'TEACHER');

  const parents = {
    suresh: await user('Suresh Malhotra', 'suresh.malhotra@campusone.test', 'PARENT'),
    kavita: await user('Kavita Nair', 'kavita.nair@campusone.test', 'PARENT'),
    rajiv: await user('Rajiv Bhatia', 'rajiv.bhatia@campusone.test', 'PARENT'),
    sunita: await user('Sunita Gill', 'sunita.gill@campusone.test', 'PARENT'),
  };

  const classroom = await prisma.classroom.create({ data: { name: 'IT-1' } });
  await prisma.classroom.create({ data: { name: 'IT-2' } });

  const roster: [string, string, string | null][] = [
    ['Aarav Malhotra', 'aarav.malhotra', parents.suresh.id],
    ['Diya Nair', 'diya.nair', parents.kavita.id],
    ['Kabir Nair', 'kabir.nair', parents.kavita.id],
    ['Ishaan Bhatia', 'ishaan.bhatia', parents.rajiv.id],
    ['Meera Gill', 'meera.gill', parents.sunita.id],
    ['Rohan Kapoor', 'rohan.kapoor', null],
    ['Sana Iyer', 'sana.iyer', null],
    ['Tanvi Joshi', 'tanvi.joshi', null],
  ];
  const students = [];
  for (let i = 0; i < roster.length; i++) {
    const [name, handle, parentId] = roster[i];
    const u = await user(name, `${handle}@campusone.test`, 'STUDENT');
    students.push(
      await prisma.student.create({
        data: { userId: u.id, rollNo: `IT1-${String(i + 1).padStart(3, '0')}`, classroomId: classroom.id, parentId },
      }),
    );
  }

  const mk = (code: string, name: string, teacherId: string) =>
    prisma.course.create({ data: { code, name, classroomId: classroom.id, teacherId } });
  const cs201 = await mk('CS201', 'Data Structures', anita.id);
  const cs202 = await mk('CS202', 'Database Systems', vikram.id);
  const cs203 = await mk('CS203', 'Operating Systems', anita.id);
  const cs204 = await mk('CS204', 'Web Technologies', vikram.id);
  const courses = [cs201, cs202, cs203, cs204];

  // Attendance: previous 15 weekdays (today is left open so a teacher can take it live).
  const days: string[] = [];
  for (let off = -1; days.length < 15; off--) {
    const d = day(off);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(ymd(d));
  }
  const attendance = [];
  for (let s = 0; s < students.length; s++) {
    // Rohan (index 5) is deliberately low so the shortage warning is visible in the demo.
    const absentChance = s === 5 ? 0.32 : 0.08;
    for (const course of courses) {
      for (const date of days) {
        const r = rand();
        const status = r < absentChance ? 'ABSENT' : r < absentChance + 0.05 ? 'LATE' : 'PRESENT';
        attendance.push({ studentId: students[s].id, courseId: course.id, date, status });
      }
    }
  }
  await prisma.attendance.createMany({ data: attendance });

  // Assignments and submissions
  const answer = (t: string) => `${t}\n\nSubmitted with explanations and sample runs attached in the lab file.`;
  const mkAssignment = (courseId: string, title: string, description: string, dueOffset: number, maxMarks: number) =>
    prisma.assignment.create({ data: { courseId, title, description, dueDate: day(dueOffset, 23), maxMarks, createdAt: day(dueOffset - 10) } });

  const a1 = await mkAssignment(cs201.id, 'Linked list implementation', 'Implement singly and doubly linked lists with insert, delete and reverse. Include complexity notes.', -8, 20);
  const a2 = await mkAssignment(cs201.id, 'Binary tree traversals', 'Write iterative and recursive in-order, pre-order and post-order traversals.', 3, 20);
  const a3 = await mkAssignment(cs202.id, 'ER diagram for a library', 'Design an ER diagram for a library system and convert it to relational tables.', -10, 25);
  const a4 = await mkAssignment(cs202.id, 'SQL joins worksheet', 'Solve the 10 questions on inner, outer and self joins using the sample schema.', 5, 15);
  const a5 = await mkAssignment(cs203.id, 'Process scheduling report', 'Compare FCFS, SJF and Round Robin on the given workload with Gantt charts.', -2, 30);
  await mkAssignment(cs204.id, 'Personal portfolio page', 'Build a responsive one-page portfolio using semantic HTML and CSS.', 9, 20);

  const feedback = ['Clear and correct. Add edge cases next time.', 'Good structure. Explain the complexity more.', 'Solid work.', 'Needs more detail in the reversal step.'];
  const submit = async (a: { id: string }, sIdx: number, content: string, offsetDays: number, marks?: number, fb?: string) => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: a.id,
        studentId: students[sIdx].id,
        content: answer(content),
        submittedAt: day(offsetDays, 15),
        ...(marks !== undefined ? { marks, feedback: fb ?? null, gradedAt: day(offsetDays + 1, 12) } : {}),
      },
    });
    if (marks !== undefined) {
      const a2 = await prisma.assignment.findUniqueOrThrow({ where: { id: a.id }, include: { course: true } });
      await prisma.notification.create({
        data: { userId: students[sIdx].userId, title: `${a2.title} was graded`, body: `${marks}/${a2.maxMarks} in ${a2.course.code}.`, link: '/grades', createdAt: day(offsetDays + 1, 12) },
      });
      if (roster[sIdx][2]) {
        await prisma.notification.create({
          data: { userId: roster[sIdx][2]!, title: `${a2.title} was graded`, body: `${marks}/${a2.maxMarks} in ${a2.course.code}.`, link: '/grades', createdAt: day(offsetDays + 1, 12) },
        });
      }
    }
    return sub;
  };

  // a1: 8 submitted, 6 graded, 2 waiting
  for (let i = 0; i < 8; i++) {
    const graded = i < 6;
    await submit(a1, i, 'Linked list solution', -9, graded ? 12 + Math.floor(rand() * 8) : undefined, graded ? feedback[i % feedback.length] : undefined);
  }
  // a2: two early submissions, ungraded
  await submit(a2, 0, 'Tree traversal solution', -1);
  await submit(a2, 6, 'Tree traversal solution', -1);
  // a3: 7 submitted and graded
  for (let i = 0; i < 7; i++) await submit(a3, i, 'ER diagram and schema', -11, 15 + Math.floor(rand() * 10), feedback[(i + 1) % feedback.length]);
  // a4: one ungraded
  await submit(a4, 3, 'Join queries', -1);
  // a5: five submitted, none graded yet
  for (const i of [0, 1, 3, 4, 6]) await submit(a5, i, 'Scheduling comparison', -3);

  // Announcements
  const ann = async (authorId: string, title: string, body: string, audience: string, offset: number) =>
    prisma.announcement.create({ data: { authorId, title, body, audience, createdAt: day(offset, 10) } });
  await ann(admin.id, 'Welcome to the new semester', 'Classes for IT-1 run Monday to Friday. Please check your timetable and confirm your course list with your class teacher this week.', 'ALL', -12);
  await ann(admin.id, 'Mid-semester exam schedule', 'Mid-semester exams begin in three weeks. The detailed date sheet will be shared on this page once it is approved.', 'STUDENT', -5);
  await ann(admin.id, 'Parent-teacher meeting', 'The parent-teacher meeting for IT-1 is on the first Saturday of next month, 10 am to 1 pm, in the main seminar hall.', 'PARENT', -3);
  await ann(anita.id, 'Lab file format', 'Submit lab work as a single document with the aim, code, output and a short conclusion for each experiment.', 'STUDENT', -2);

  const everyone = await prisma.user.findMany({ where: { id: { not: admin.id } }, select: { id: true, role: true } });
  await prisma.notification.createMany({
    data: everyone
      .filter((u) => u.role !== 'PARENT' || true)
      .map((u) => ({ userId: u.id, title: 'Welcome to the new semester', body: 'New announcement from Neha Kulkarni.', link: '/announcements', createdAt: day(-12, 10), read: true })),
  });
  await prisma.notification.createMany({
    data: [parents.suresh, parents.kavita, parents.rajiv, parents.sunita].map((p) => ({
      userId: p.id, title: 'Parent-teacher meeting', body: 'New announcement from Neha Kulkarni.', link: '/announcements', createdAt: day(-3, 10),
    })),
  });
  await prisma.notification.createMany({
    data: [anita.id].map((t) => ({ userId: t, title: 'Aarav Malhotra submitted Process scheduling report', body: 'CS203 · ready for grading.', link: '/assignments', createdAt: day(-3, 15) })),
  });

  console.log('Seeded. Every account uses the password:', PASSWORD);
}

main().finally(() => prisma.$disconnect());
