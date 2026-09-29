'use client';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { fmtShort } from '@/lib/format';
import { Empty, ErrorNote, Meter, PageHeader, Panel, Spinner } from '@/components/ui';
import type { GradesPayload } from '@/lib/types';

export default function GradesPage() {
  const { user, activeStudent } = useAuth();
  const { data, loading, error, reload } = useFetch<GradesPayload>(activeStudent ? `/grades?studentId=${activeStudent.id}` : null);
  const parent = user?.role === 'PARENT';

  return (
    <>
      <PageHeader title="Grades" subtitle={parent && activeStudent ? `Graded work for ${activeStudent.name}.` : 'Your marks and teacher feedback, course by course.'} />
      {loading ? <Spinner /> : error || !data ? <ErrorNote message={error || 'Could not load grades.'} onRetry={reload} /> : (
        <div className="space-y-6">
          <div className="rounded border border-line bg-surface px-5 py-4">
            <p className="text-sm text-muted">Average across graded work</p>
            <p className="font-serif text-[40px] leading-tight">{data.overall === null ? 'Nothing graded yet' : `${data.overall}%`}</p>
          </div>
          {data.courses.map((c) => (
            <Panel key={c.courseId} title={`${c.code} · ${c.name}`} action={<span className="font-serif text-xl">{c.percentage === null ? '–' : `${c.percentage}%`}</span>}>
              {c.items.length === 0 ? <Empty title="No graded work yet" /> : (
                <>
                  <div className="px-5 pt-4"><Meter value={c.percentage} target={40} /></div>
                  <ul className="divide-y divide-line">
                    {c.items.map((i) => (
                      <li key={i.id} className="px-5 py-3.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium">{i.title}</p>
                          <p className="whitespace-nowrap font-semibold">{i.marks}<span className="font-normal text-muted"> / {i.maxMarks}</span></p>
                        </div>
                        {i.feedback && <p className="mt-0.5 text-sm text-muted">“{i.feedback}”</p>}
                        <p className="mt-0.5 text-xs text-muted">Graded {fmtShort(i.gradedAt)}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
