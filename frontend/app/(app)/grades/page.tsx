'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, Loading, Panel, Pill, Stat, Track, useAction } from '@/components/ui';
import type { Course, Grades } from '@/lib/types';

interface ClassMarks { max: number; rows: { studentId: string; name: string; rollNo: string; marks: number | null }[] }

function TeacherGrades() {
  usePage('Grades', 'Internal assessment, out of 25');
  const courses = useFetch<Course[]>('/courses');
  const [courseId, setCourseId] = useState('');
  useEffect(() => { if (!courseId && courses.data?.length) setCourseId(courses.data[0].id); }, [courses.data, courseId]);
  const state = useFetch<ClassMarks>(courseId ? `/grades/class?courseId=${courseId}` : null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const { busy, run } = useAction();
  useEffect(() => {
    if (state.data) { setMarks(Object.fromEntries(state.data.rows.map((r) => [r.studentId, r.marks?.toString() ?? '']))); setDirty(false); }
  }, [state.data]);

  if (!courses.data) return <Loading />;
  const max = state.data?.max ?? 25;
  const vals = Object.values(marks).filter((v) => v !== '').map(Number);
  const set = (id: string, v: string) => {
    if (v !== '') v = String(Math.max(0, Math.min(max, Math.round(Number(v)))));
    setMarks((m) => ({ ...m, [id]: v })); setDirty(true);
  };
  const save = () => run(() => api<{ saved: number }>('/grades/class', {
    method: 'PUT', body: { courseId, marks: Object.entries(marks).filter(([, v]) => v !== '').map(([studentId, v]) => ({ studentId, marks: Number(v) })) },
  }), (r) => (r.saved ? `Marks saved for ${r.saved} ${r.saved === 1 ? 'student' : 'students'}. They have been notified.` : 'No marks changed')).then((r) => { if (r) { setDirty(false); state.reload(); } });

  return (
    <section className="card">
      <header className="card-h">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course" style={{ width: 'auto' }}>
          {courses.data.map((c) => <option key={c.id} value={c.id}>{c.code}, {c.name}</option>)}
        </select>
        {vals.length > 0 && <span className="counter">Class average <b>{(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}</b> of {max}, highest <b>{Math.max(...vals)}</b>, below 15: <b>{vals.filter((x) => x < 15).length}</b></span>}
      </header>
      <Async state={state}>
        {(d) => (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Student</th><th>Marks</th><th>Out of {max}</th></tr></thead>
              <tbody>
                {d.rows.map((r) => {
                  const v = marks[r.studentId] ?? '';
                  return (
                    <tr key={r.studentId}>
                      <td><div className="who"><Avatar name={r.name} /><div><b>{r.name}</b><small className="mono">{r.rollNo}</small></div></div></td>
                      <td><input className="gm" type="number" min={0} max={max} inputMode="numeric" value={v} onChange={(e) => set(r.studentId, e.target.value)} aria-label={`Marks for ${r.name}`} /></td>
                      <td className="w-bar"><Track pct={v === '' ? 0 : (Number(v) / max) * 100} tone={v !== '' && Number(v) < 15 ? 'warn' : ''} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      <footer className="card-f">
        {dirty && <span className="hint">Unsaved changes</span>}
        <button className="btn primary" disabled={busy || !dirty} onClick={save}><Icon name="check" size={16} />Save marks</button>
      </footer>
    </section>
  );
}

function StudentGrades({ parent }: { parent: boolean }) {
  usePage('Grades', 'Internal marks and results');
  const { sep, ready } = useStudentQuery();
  const state = useFetch<Grades>(ready ? sep('/grades') : null);
  return (
    <Async state={state}>
      {(g) => {
        const last = g.semesters[g.semesters.length - 1];
        const best = g.semesters.length ? Math.max(...g.semesters.map((s) => s.sgpa)) : null;
        return (
          <>
            <div className="stats">
              <Stat label="CGPA" value={g.cgpa?.toFixed(2) ?? '—'} note={g.semesters.length ? `Semesters 1 to ${g.semesters.length}` : 'No results yet'} />
              <Stat label="Last SGPA" value={last ? last.sgpa.toFixed(2) : '—'} note={last ? `Semester ${last.semester}${last.sgpa === best ? ', best so far' : ''}` : ''} />
              <Stat label="Credits earned" value={g.creditsEarned} note={`Of ${g.degreeCredits} for the degree`} />
            </div>
            <div className="grid-2">
              <Panel title="Internal marks, this semester" flush>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Subject</th><th>Marks</th><th>Out of {g.max}</th><th>Standing</th></tr></thead>
                    <tbody>
                      {g.internals.map((c) => (
                        <tr key={c.code}>
                          <td><b>{c.name}</b><div className="hint mono">{c.code}</div></td>
                          <td>{c.marks === null ? <span className="hint">Not entered</span> : <><b className="mono">{c.marks}</b> / {g.max}</>}</td>
                          <td className="w-bar"><Track pct={((c.marks ?? 0) / g.max) * 100} tone={c.marks !== null && c.marks < 15 ? 'warn' : ''} /></td>
                          <td>{c.marks !== null && <Pill tone={c.marks >= 20 ? 'ok' : c.marks >= 15 ? 'acc' : 'warn'}>{c.marks >= 20 ? 'Strong' : c.marks >= 15 ? 'On track' : 'Needs work'}</Pill>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="SGPA by semester">
                {g.semesters.length ? (
                  <>
                    <div className="vbars" role="img" aria-label={`SGPA: ${g.semesters.map((s) => s.sgpa).join(', ')}`}>
                      {g.semesters.map((s) => <div key={s.semester} className="vb"><b>{s.sgpa.toFixed(1)}</b><i style={{ height: `${Math.max(4, ((s.sgpa - 6) / 4) * 100)}%` }} /><small>Sem {s.semester}</small></div>)}
                    </div>
                    <p className="hint" style={{ marginTop: 10 }}>Bars start at 6.0 so the differences are visible.</p>
                  </>
                ) : <Empty>Results appear after the first semester.</Empty>}
              </Panel>
            </div>
            <div className="mt">
              <Panel title="Graded assignments">
                {g.assignments.length ? (
                  <ul className="list">
                    {g.assignments.map((a) => (
                      <li key={a.id}>
                        <div className="grow"><b>{a.title}</b><small>{a.code}, graded {fmtDate(a.gradedAt)}{a.feedback ? `. "${a.feedback}"` : ''}</small></div>
                        <Pill tone={a.marks / a.maxMarks >= 0.6 ? 'ok' : 'warn'}>{a.marks} / {a.maxMarks}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>{parent ? 'No graded work yet.' : 'Graded work shows up here once your professor marks it.'}</Empty>}
              </Panel>
            </div>
          </>
        );
      }}
    </Async>
  );
}

export default function GradesPage() {
  const { user } = useAuth();
  if (user!.role === 'TEACHER') return <TeacherGrades />;
  if (user!.role === 'ADMIN') return <Empty>Grades are entered by professors.</Empty>;
  return <StudentGrades parent={user!.role === 'PARENT'} />;
}
