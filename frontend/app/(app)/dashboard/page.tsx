'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { fmtDate, fmtShort, greeting, relativeDay } from '@/lib/format';
import { Badge, Empty, ErrorNote, PageHeader, Panel, Spinner } from '@/components/ui';
import type { Announcement } from '@/lib/types';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'bad' | 'ok' }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-serif text-[32px] leading-none ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</p>
    </div>
  );
}
const StatStrip = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-6 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded border border-line bg-surface sm:grid-cols-4 sm:divide-y-0 [&>*:nth-child(odd)]:border-l-0">{children}</div>
);

function Announcements({ items }: { items: Announcement[] }) {
  return (
    <Panel title="Latest announcements" action={<Link href="/announcements" className="text-sm font-medium underline">See all</Link>}>
      {items.length === 0 ? <Empty title="No announcements yet" /> : (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a.id} className="px-5 py-3.5">
              <p className="font-medium">{a.title}</p>
              <p className="line-clamp-2 text-sm text-muted">{a.body}</p>
              <p className="mt-1 text-xs text-muted">{a.author} · {fmtDate(a.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function DashboardPage() {
  const { user, activeStudent } = useAuth();
  const isFamily = user?.role === 'STUDENT' || user?.role === 'PARENT';
  const path = user ? (isFamily ? (activeStudent ? `/dashboard?studentId=${activeStudent.id}` : null) : '/dashboard') : null;
  const { data, error, loading, reload } = useFetch<any>(path);
  const first = user?.name.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(' ')[0];

  const title = `${greeting()}, ${first}`;
  if (loading) return <><PageHeader title={title} /><Spinner /></>;
  if (error || !data) return <><PageHeader title={title} /><ErrorNote message={error || 'Could not load the dashboard.'} onRetry={reload} /></>;

  if (data.role === 'ADMIN') {
    return (
      <>
        <PageHeader title={title} subtitle="Here is how the campus looks today." />
        <StatStrip>
          <Stat label="Students" value={data.counts.students} />
          <Stat label="Teachers" value={data.counts.teachers} />
          <Stat label="Classes" value={data.counts.classrooms} />
          <Stat label="Attendance today" value={data.attendanceToday === null ? 'None yet' : `${data.attendanceToday}%`} tone={data.attendanceToday === null ? undefined : data.attendanceToday >= 75 ? 'ok' : 'bad'} />
        </StatStrip>
        <div className="grid gap-6 lg:grid-cols-2">
          <Announcements items={data.latestAnnouncements} />
          <Panel title="Quick actions">
            <div className="flex flex-col gap-2 p-5">
              <Link href="/people" className="btn-quiet justify-start">Add a student, teacher or parent</Link>
              <Link href="/classes" className="btn-quiet justify-start">Create a class or course</Link>
              <Link href="/announcements" className="btn-quiet justify-start">Post an announcement</Link>
            </div>
          </Panel>
        </div>
      </>
    );
  }

  if (data.role === 'TEACHER') {
    return (
      <>
        <PageHeader title={title} subtitle="Your classes and grading for today." />
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Today's attendance">
            {data.courses.length === 0 ? <Empty title="No courses assigned" hint="Ask an administrator to assign you a course." /> : (
              <ul className="divide-y divide-line">
                {data.courses.map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="font-medium">{c.code} · {c.name}</p>
                      <p className="text-sm text-muted">{c.classroom}</p>
                    </div>
                    {c.markedToday ? <Badge tone="ok">Marked</Badge> : <Link href={`/attendance?courseId=${c.id}`} className="btn-primary !py-1.5">Take attendance</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Waiting for grading">
            {data.needsGrading.length === 0 ? <Empty title="Nothing to grade" hint="New submissions will show up here." /> : (
              <ul className="divide-y divide-line">
                {data.needsGrading.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="text-sm text-muted">{a.course} · {a.waiting} to grade</p>
                    </div>
                    <Link href={`/assignments?open=${a.id}`} className="btn-quiet !py-1.5">Grade</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="mt-6"><Announcements items={data.latestAnnouncements} /></div>
      </>
    );
  }

  // Student or parent
  const att = data.attendanceOverall as number | null;
  return (
    <>
      <PageHeader title={title} subtitle={user?.role === 'PARENT' && activeStudent ? `Progress for ${activeStudent.name}.` : 'Here is where you stand this semester.'} />
      <StatStrip>
        <Stat label="Attendance" value={att === null ? 'None yet' : `${att}%`} tone={att === null ? undefined : att >= 75 ? 'ok' : 'bad'} />
        <Stat label="Average grade" value={data.gradeOverall === null ? 'None yet' : `${data.gradeOverall}%`} />
        <Stat label="Due soon" value={data.dueSoon.length} />
        <Stat label="Overdue" value={data.overdueCount} tone={data.overdueCount ? 'bad' : undefined} />
      </StatStrip>
      {att !== null && att < 75 && (
        <div className="mb-6 rounded border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">Attendance is below the 75% requirement. <Link href="/attendance" className="font-semibold underline">See course-wise attendance</Link></div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Due soon" action={<Link href="/assignments" className="text-sm font-medium underline">All assignments</Link>}>
          {data.dueSoon.length === 0 ? <Empty title="Nothing due" hint="Everything is submitted or not yet assigned." /> : (
            <ul className="divide-y divide-line">
              {data.dueSoon.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="text-sm text-muted">{a.course} · due {fmtShort(a.dueDate)}</p>
                  </div>
                  <Badge tone="warn">{relativeDay(a.dueDate)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Announcements items={data.latestAnnouncements} />
      </div>
    </>
  );
}
