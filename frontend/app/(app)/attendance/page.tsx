'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { fmtDate, todayISO } from '@/lib/format';
import { Badge, Empty, ErrorNote, Meter, PageHeader, Panel, Spinner, SubmitButton, useToast } from '@/components/ui';
import type { AttendanceSummary, AttStatus, Course, RosterRow } from '@/lib/types';

const STATUSES: { value: AttStatus; label: string; on: string }[] = [
  { value: 'PRESENT', label: 'Present', on: 'bg-ok text-white border-ok' },
  { value: 'LATE', label: 'Late', on: 'bg-warn text-white border-warn' },
  { value: 'ABSENT', label: 'Absent', on: 'bg-bad text-white border-bad' },
];
const tone = (s: AttStatus) => (s === 'PRESENT' ? 'ok' : s === 'LATE' ? 'warn' : 'bad');
const label = (s: AttStatus) => s[0] + s.slice(1).toLowerCase();

/* ---------- Teacher: take attendance ---------- */
function TakeAttendance() {
  const toast = useToast();
  const params = useSearchParams();
  const { data: courses, loading: loadingCourses, error: coursesError } = useFetch<Course[]>('/courses');
  const [courseId, setCourseId] = useState(params.get('courseId') || '');
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState<Record<string, AttStatus | null>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (!courseId && courses?.length) setCourseId(courses[0].id); }, [courses, courseId]);
  const rosterPath = courseId && date ? `/attendance/roster?courseId=${courseId}&date=${date}` : null;
  const { data: roster, loading, error, reload } = useFetch<RosterRow[]>(rosterPath);

  useEffect(() => {
    if (roster) { setMarks(Object.fromEntries(roster.map((r) => [r.studentId, r.status]))); setDirty(false); }
  }, [roster]);

  const set = (id: string, s: AttStatus) => { setMarks((m) => ({ ...m, [id]: s })); setDirty(true); };
  const markAll = () => { if (roster) { setMarks(Object.fromEntries(roster.map((r) => [r.studentId, 'PRESENT' as AttStatus]))); setDirty(true); } };
  const unmarked = roster ? roster.filter((r) => !marks[r.studentId]).length : 0;
  const counts = useMemo(() => {
    const v = Object.values(marks);
    return { present: v.filter((x) => x === 'PRESENT').length, late: v.filter((x) => x === 'LATE').length, absent: v.filter((x) => x === 'ABSENT').length };
  }, [marks]);

  const save = async () => {
    if (!roster) return;
    setSaving(true);
    try {
      await api('/attendance/mark', { method: 'POST', body: { courseId, date, records: roster.map((r) => ({ studentId: r.studentId, status: marks[r.studentId] })) } });
      toast(`Attendance saved for ${roster.length} students.`);
      setDirty(false); reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not save attendance.', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="Attendance" subtitle="Pick a course and date, mark each student, then save." />
      {coursesError && <ErrorNote message={coursesError} />}
      {loadingCourses ? <Spinner /> : !courses?.length ? (
        <Panel><Empty title="No courses assigned" hint="Ask an administrator to assign you a course." /></Panel>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Course</span>
              <select className="field !h-[42px] !w-auto min-w-[240px]" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.classroom})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Date</span>
              <input type="date" className="field !h-[42px] !w-auto" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          </div>

          <Panel>
            {loading ? <Spinner label="Loading class list" /> : error ? <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div> : !roster?.length ? (
              <Empty title="No students in this class" hint="Add students to the class from the People page." />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-ok">{counts.present}</span> present · <span className="font-semibold text-warn">{counts.late}</span> late · <span className="font-semibold text-bad">{counts.absent}</span> absent
                    {unmarked > 0 && <> · {unmarked} not marked</>}
                  </p>
                  <button className="btn-quiet !py-1.5" onClick={markAll}>Mark everyone present</button>
                </div>
                <ul className="divide-y divide-line">
                  {roster.map((r) => (
                    <li key={r.studentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-sm text-muted">{r.rollNo}</p>
                      </div>
                      <div className="flex gap-1.5" role="group" aria-label={`Attendance for ${r.name}`}>
                        {STATUSES.map((s) => (
                          <button key={s.value} aria-pressed={marks[r.studentId] === s.value} onClick={() => set(r.studentId, s.value)}
                            className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${marks[r.studentId] === s.value ? s.on : 'border-line bg-surface text-muted hover:border-ink/40 hover:text-ink'}`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
                  <p className="text-sm text-muted">{unmarked > 0 ? 'Mark every student before saving.' : dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
                  <SubmitButton busy={saving} disabled={unmarked > 0 || !dirty} onClick={save}>Save attendance</SubmitButton>
                </div>
              </>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

/* ---------- Student / parent: view ---------- */
function ViewAttendance() {
  const { activeStudent, user } = useAuth();
  const { data, error, loading, reload } = useFetch<AttendanceSummary>(activeStudent ? `/attendance/summary?studentId=${activeStudent.id}` : null);

  return (
    <>
      <PageHeader title="Attendance" subtitle={user?.role === 'PARENT' && activeStudent ? `Attendance for ${activeStudent.name}. A minimum of 75% is required in each course.` : 'A minimum of 75% is required in each course.'} />
      {loading ? <Spinner /> : error || !data ? <ErrorNote message={error || 'Could not load attendance.'} onRetry={reload} /> : (
        <div className="space-y-6">
          <div className="rounded border border-line bg-surface px-5 py-4">
            <p className="text-sm text-muted">Overall</p>
            <p className={`font-serif text-[40px] leading-tight ${data.overall === null ? '' : data.overall >= 75 ? 'text-ok' : 'text-bad'}`}>{data.overall === null ? 'No classes recorded yet' : `${data.overall}%`}</p>
            {data.overall !== null && <p className="text-sm text-muted">across {data.total} recorded classes</p>}
          </div>

          <Panel title="By course">
            <ul className="divide-y divide-line">
              {data.courses.map((c) => (
                <li key={c.courseId} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{c.code} · {c.name}</p>
                    <p className={`font-serif text-xl ${c.percentage === null ? 'text-muted' : c.percentage >= 75 ? 'text-ok' : 'text-bad'}`}>{c.percentage === null ? '–' : `${c.percentage}%`}</p>
                  </div>
                  <div className="my-2"><Meter value={c.percentage} /></div>
                  <p className="text-sm text-muted">{c.present} present · {c.late} late · {c.absent} absent{c.percentage !== null && c.percentage < 75 && <span className="font-medium text-bad"> · Below 75%</span>}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent classes">
            {data.recent.length === 0 ? <Empty title="Nothing recorded yet" /> : (
              <ul className="divide-y divide-line">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div><p className="text-sm font-medium">{r.course}</p><p className="text-xs text-muted">{fmtDate(r.date)}</p></div>
                    <Badge tone={tone(r.status)}>{label(r.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

export default function AttendancePage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'TEACHER' || user.role === 'ADMIN') return <Suspense fallback={<Spinner />}><TakeAttendance /></Suspense>;
  return <ViewAttendance />;
}
