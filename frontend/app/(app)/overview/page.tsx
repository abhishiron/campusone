'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch, useStudentQuery, useTick } from '@/lib/hooks';
import { ago, daysLeft, dueText, examDay, fmtDate, greeting, inr } from '@/lib/format';
import { classesOn } from '@/lib/timetable';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, Loading, ErrorNote, Panel, Pill, Stat, Track, pctTone } from '@/components/ui';
import { LineChart, RiskBanner } from '@/components/attendance';
import { sessionStatus } from '@/components/study';
import type { Announcement, Assignment, AttendanceSummary, CheckInRec, ExamsPayload, Fees, Grades, LibraryPayload, StudySession, Timetable } from '@/lib/types';

/* ---------------- admin ---------------- */
interface AdminData {
  counts: { students: number; active: number; faculty: number; onLeave: number; courses: number; depts: number };
  attendance30: number | null; enrollment: { dept: string; n: number }[]; weeks: { label: string; pct: number | null }[]; activity: { id: string; text: string; createdAt: string }[];
}
interface Health { dbMs: number; provider: string; uptimeSec: number; memoryMB: number; node: string; uploads: { files: number; bytes: number }; unreadNotifications: number; users: number }

function SystemHealth() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let stop = false;
    const load = () => api<Health>('/health/details').then((x) => { if (!stop) { setH(x); setErr(false); } }).catch(() => !stop && setErr(true));
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  const up = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);
  if (err && !h) return <ErrorNote message="The API is not responding." />;
  if (!h) return <Loading />;
  const rows: [string, string, string][] = [
    ['CampusOne API', `NestJS on Node ${h.node}, up ${up(h.uptimeSec)}`, `${h.memoryMB} MB`],
    ['Database', `${h.provider}, round trip`, `${h.dbMs.toFixed(1)} ms`],
    ['File storage', `${h.uploads.files} uploaded files`, `${(h.uploads.bytes / 1048576).toFixed(1)} MB`],
    ['Notifications', 'Unread across all accounts', String(h.unreadNotifications)],
  ];
  return (
    <ul className="svc">
      {rows.map(([n, d, v]) => <li key={n}><i className={`dot ${err ? 'off' : ''}`} /><div><b>{n}</b><small>{d}</small></div><span className="mono">{v}</span></li>)}
    </ul>
  );
}

function AdminOverview() {
  usePage('Institute overview', 'Odd semester 2026, all departments');
  const state = useFetch<AdminData>('/dashboard');
  return (
    <Async state={state}>
      {(d) => {
        const max = Math.max(1, ...d.enrollment.map((e) => e.n));
        return (
          <>
            <div className="stats">
              <Stat label="Students enrolled" value={d.counts.students.toLocaleString('en-IN')} note={`${d.counts.active} active accounts`} />
              <Stat label="Faculty members" value={d.counts.faculty} note={`${d.counts.onLeave} on leave`} />
              <Stat label="Courses running" value={d.counts.courses} note={`Across ${d.counts.depts} ${d.counts.depts === 1 ? 'department' : 'departments'}`} />
              <Stat label="Average attendance" value={d.attendance30 === null ? '—' : `${d.attendance30.toFixed(1)}%`} note="Last 30 days" />
            </div>
            <div className="grid-2">
              <Panel title="Enrollment by department">
                {d.enrollment.map((e) => (
                  <div key={e.dept} className="hbar"><span>{e.dept}</span><Track pct={(e.n / max) * 100} /><b>{e.n}</b></div>
                ))}
              </Panel>
              <Panel title="System health" extra={<span className="live"><i />Live</span>}><SystemHealth /></Panel>
            </div>
            <div className="grid-2">
              <Panel title="Attendance, last 8 weeks"><LineChart points={d.weeks} /></Panel>
              <Panel title="Recent activity">
                {d.activity.length ? (
                  <ul className="feed-mini">{d.activity.map((a) => <li key={a.id}><span className="tick" /><div><p>{a.text}</p><small>{ago(a.createdAt)}</small></div></li>)}</ul>
                ) : <Empty>Nothing has happened yet.</Empty>}
              </Panel>
            </div>
          </>
        );
      }}
    </Async>
  );
}

/* ---------------- professor ---------------- */
interface TeacherData {
  today: { courseId: string; code: string; name: string; room: string; time: string; marked: boolean; start: number; end: number }[];
  toReview: number; assignmentCount: number; courses: { id: string; code: string; name: string }[]; studentsTaught: number;
  avgAttendance: number | null; below: { name: string; code: string; pct: number }[]; pendingLeaves: number;
  open: { id: string; title: string; code: string; dueDate: string; submitted: number; classSize: number }[];
}

function TeacherOverview() {
  const { user } = useAuth();
  // "Dr. Neha Sharma" is greeted as "Dr. Sharma"; names without a title use the first name.
  const parts = user!.name.split(' ');
  const called = /^(Dr|Prof|Ms|Mr|Mrs)\.$/.test(parts[0]) ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
  usePage(`Good ${greeting()}, ${called}`, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }));
  const state = useFetch<TeacherData>('/dashboard');
  return (
    <Async state={state}>
      {(d) => (
        <>
          {d.pendingLeaves > 0 && (
            <div className="banner"><Icon name="leave" size={18} /><span><b>{d.pendingLeaves}</b> leave {d.pendingLeaves === 1 ? 'request is' : 'requests are'} waiting for you as class coordinator.</span><Link className="btn sm" href="/leaves">Review</Link></div>
          )}
          <div className="stats">
            <Stat label="Classes today" value={d.today.length} note={d.today.length ? `First at ${d.today[0].time.split('–')[0]}` : 'Free day'} />
            <Stat label="Submissions to review" value={d.toReview} note={`Across ${d.assignmentCount} assignments`} />
            <Stat label="Your courses" value={d.courses.length} note={`${d.studentsTaught} students`} />
            <Stat label="Average attendance" value={d.avgAttendance === null ? '—' : `${Math.round(d.avgAttendance)}%`} note="In your courses" />
          </div>
          <div className="grid-2">
            <Panel title="Today's classes">
              {d.today.length ? (
                <ul className="list">
                  {d.today.map((s) => (
                    <li key={s.code + s.start}>
                      <span className="time">{s.time}</span>
                      <div className="grow"><b>{s.name}</b><small>{s.code}, {s.room}</small></div>
                      {s.marked ? <Pill tone="ok">Saved</Pill> : <Link className="btn sm" href={`/attendance?course=${s.courseId}`}>Take attendance</Link>}
                    </li>
                  ))}
                </ul>
              ) : <Empty>No classes today. Your timetable resumes on the next working day.</Empty>}
            </Panel>
            <Panel title="Below 75% attendance">
              {d.below.length ? (
                <ul className="list">{d.below.map((b) => <li key={b.name + b.code}><Avatar name={b.name} /><div className="grow"><b>{b.name}</b><small>{b.code}</small></div><Pill tone={pctTone(b.pct)}>{Math.round(b.pct)}%</Pill></li>)}</ul>
              ) : <Empty>Everyone in your courses is at or above 75%.</Empty>}
            </Panel>
          </div>
          <div className="mt">
            <Panel title="Open assignments" extra={<Link className="btn sm" href="/assignments">View all</Link>}>
              {d.open.length ? (
                <ul className="list">
                  {d.open.map((a) => (
                    <li key={a.id}>
                      <div className="grow"><b>{a.title}</b><small>{a.code}, due {fmtDate(a.dueDate)}</small></div>
                      <div style={{ width: 'min(180px,34%)' }}><Track pct={a.classSize ? (a.submitted / a.classSize) * 100 : 0} /><small className="hint">{a.submitted} of {a.classSize} submitted</small></div>
                    </li>
                  ))}
                </ul>
              ) : <Empty>No open assignments. Create one from the Assignments page.</Empty>}
            </Panel>
          </div>
        </>
      )}
    </Async>
  );
}

/* ---------------- student and parent ---------------- */
function StudentOverview({ parent }: { parent: boolean }) {
  const { user, activeStudent } = useAuth();
  const { sep, ready } = useStudentQuery();
  const p = (path: string) => (ready ? sep(path) : null);
  useTick(30000);
  const first = (parent ? activeStudent?.name : user?.name)?.split(' ')[0] ?? '';
  usePage(parent ? `${first} at a glance` : `Welcome back, ${first}`, activeStudent ? `${activeStudent.program}, semester ${activeStudent.semester}, section ${activeStudent.classroom}` : undefined);

  const att = useFetch<AttendanceSummary>(p('/attendance/summary'));
  const asg = useFetch<Assignment[]>(p('/assignments'));
  const tt = useFetch<Timetable>(p('/timetable'));
  const grades = useFetch<Grades>(p('/grades'));
  const exams = useFetch<ExamsPayload>(p('/exams'));
  const lib = useFetch<LibraryPayload>(p('/library'));
  const fees = useFetch<Fees>(p('/fees'));
  const anns = useFetch<Announcement[]>('/announcements');
  const study = useFetch<{ sessions: StudySession[] }>(parent ? null : '/study');
  const ci = useFetch<{ window: { code: string; name: string; until: string } | null; mine: CheckInRec | null }>(parent ? null : '/checkin/current');

  const core = [att, asg, tt, grades, exams, lib, fees, anns];
  const failed = core.find((x) => x.error && !x.data);
  if (failed) return <ErrorNote message={failed.error!} onRetry={failed.reload} />;
  if (core.some((x) => !x.data)) return <Loading />;
  const a = att.data!, now = new Date();
  const pending = asg.data!.filter((x) => !x.submission && new Date(x.dueDate) >= now);
  const low = a.courses.filter((c) => c.level === 'DANGER');
  const weekday = now.getDay();
  const today = weekday >= 1 && weekday <= 5 ? classesOn(tt.data!, weekday) : [];
  const names = new Map(tt.data!.courses.map((c) => [c.code, c.name]));
  const nextExam = exams.data!.exams.find((e) => daysLeft(e.date) >= 0);
  const book = lib.data!.books[0];
  const sess = study.data?.sessions[0];
  const w = ci.data?.window && !ci.data.mine ? ci.data.window : null;

  const coming: React.ReactNode[] = [];
  if (sess) {
    const st = sessionStatus(sess);
    coming.push(<li key="s"><span className="ico"><Icon name="video" size={16} /></span><div className="grow"><b>{sess.title}</b><small>Study room, {st.text.toLowerCase()}</small></div><a className={`btn sm ${st.k === 'live' ? 'primary' : ''}`} href={sess.link} target="_blank" rel="noopener noreferrer">Join on Meet</a></li>);
  }
  if (nextExam) {
    const d = daysLeft(nextExam.date);
    coming.push(<li key="e"><span className="ico"><Icon name="exam" size={16} /></span><div className="grow"><b>Mid-sem: {nextExam.name}</b><small>{examDay(nextExam.date)}, {nextExam.room}, seat {nextExam.seat}</small></div><Pill tone={d <= 3 ? 'warn' : 'acc'}>{d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`}</Pill></li>);
  }
  if (book) {
    coming.push(<li key="b"><span className="ico"><Icon name="lib" size={16} /></span><div className="grow"><b>Return &quot;{book.title}&quot;</b><small>Library, due {fmtDate(book.dueOn)}</small></div><Pill tone={book.daysLeft < 0 ? 'bad' : book.daysLeft <= 3 ? 'warn' : 'acc'}>{book.daysLeft < 0 ? `Overdue, ${inr(book.fine)} fine` : book.daysLeft === 0 ? 'Today' : `In ${book.daysLeft} days`}</Pill></li>);
  }
  if (fees.data!.balance > 0) {
    coming.push(<li key="f"><span className="ico"><Icon name="rupee" size={16} /></span><div className="grow"><b>Fee balance {inr(fees.data!.balance)}</b><small>{fees.data!.due ? `Due by ${fmtDate(fees.data!.due)}` : 'Semester fee'}</small></div><Link className="btn sm" href="/fees">Pay</Link></li>);
  }

  return (
    <>
      {w && (
        <div className="banner"><Icon name="pin" size={18} /><span>Check-in is open for <b>{w.name}</b>. Closes at <b>{new Date(w.until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</b>.</span><Link className="btn primary sm" href="/checkin">Check in now</Link></div>
      )}
      <RiskBanner courses={a.courses} />
      <div className="stats">
        <Stat label="Overall attendance" value={a.overall === null ? '—' : `${a.overall.toFixed(1)}%`} note={`${a.attended} of ${a.total} classes`} tone={a.overall !== null && a.overall < 75 ? 'warn' : undefined} />
        <Stat label="CGPA" value={grades.data!.cgpa?.toFixed(2) ?? '—'} note={`After ${grades.data!.semesters.length} semesters`} />
        <Stat label="Assignments pending" value={pending.length} note={pending.length ? `Next due ${fmtDate(pending[0].dueDate)}` : 'All caught up'} />
        <Stat label="Subjects below 75%" value={low.length} note={low.length ? low.map((x) => x.code).join(', ') : 'None'} tone={low.length ? 'warn' : undefined} />
      </div>
      {coming.length > 0 && <div className="mt"><Panel title="Coming up"><ul className="list">{coming}</ul></Panel></div>}
      <div className="grid-2">
        <Panel title="Today's classes" extra={<Link className="btn sm" href="/timetable">Full week</Link>}>
          {today.length ? (
            <ul className="list">{today.map((s) => <li key={s.code + s.start}><span className="time">{s.time}</span><div className="grow"><b>{names.get(s.code)}</b><small>{s.code}, {s.room}{s.end > s.start ? ', lab' : ''}</small></div></li>)}</ul>
          ) : <Empty>No classes today.</Empty>}
        </Panel>
        <Panel title="Due soon">
          {pending.length ? (
            <ul className="list">
              {pending.slice(0, 4).map((x) => (
                <li key={x.id}>
                  <div className="grow"><b>{x.title}</b><small>{x.course.code}</small></div>
                  <Pill tone={daysLeft(x.dueDate) <= 3 ? 'warn' : 'acc'}>{dueText(x.dueDate)}</Pill>
                  {!parent && <Link className="btn sm" href={`/assignments?submit=${x.id}`}>Submit</Link>}
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing due. New assignments show up here.</Empty>}
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Attendance by subject" extra={<Link className="btn sm" href="/attendance">Details</Link>}>
          {a.courses.map((x) => (
            <div key={x.code} className="hbar" style={{ gridTemplateColumns: '62px 1fr 52px' }}>
              <span className="mono">{x.code}</span><Track pct={x.pct ?? 0} tone={pctTone(x.pct, a.warnAt)} marker /><b>{x.pct === null ? '—' : `${Math.round(x.pct)}%`}</b>
            </div>
          ))}
          <p className="hint">The marker on each bar is the 75% minimum.</p>
        </Panel>
        <Panel title="Latest notices" extra={<Link className="btn sm" href="/announcements">View all</Link>}>
          {anns.data!.length ? (
            <ul className="feed-mini">{anns.data!.slice(0, 3).map((n) => <li key={n.id}><span className="tick" /><div><p><b>{n.title}</b></p><small>{n.by}, {ago(n.createdAt)}</small></div></li>)}</ul>
          ) : <Empty>No notices yet.</Empty>}
        </Panel>
      </div>
    </>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  if (user!.role === 'ADMIN') return <AdminOverview />;
  if (user!.role === 'TEACHER') return <TeacherOverview />;
  return <StudentOverview parent={user!.role === 'PARENT'} />;
}
