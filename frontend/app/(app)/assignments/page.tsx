'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { fmtDateTime, fmtShort, localInputValue, relativeDay } from '@/lib/format';
import { Badge, Empty, ErrorNote, Field, Modal, PageHeader, Panel, Segmented, Spinner, SubmitButton, useToast } from '@/components/ui';
import type { Assignment, Course, Submission, SubmissionsPayload } from '@/lib/types';

/* ================= Teacher ================= */

function NewAssignmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { data: courses } = useFetch<Course[]>('/courses');
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(() => { const d = new Date(Date.now() + 7 * 86400000); d.setHours(23, 59, 0, 0); return localInputValue(d); });
  const [maxMarks, setMaxMarks] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (courses?.length && !courseId) setCourseId(courses[0].id); }, [courses, courseId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/assignments', { method: 'POST', body: { courseId, title, description, dueDate: new Date(due).toISOString(), maxMarks: Number(maxMarks) } });
      toast('Assignment published. Students and parents were notified.');
      onCreated(); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the assignment.'); setBusy(false); }
  };

  return (
    <Modal title="New assignment" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Course">
          <select className="field" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
            {courses?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </Field>
        <Field label="Title"><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} placeholder="e.g. Stack and queue implementation" /></Field>
        <Field label="Instructions"><textarea className="field min-h-[110px]" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={3} placeholder="What should students submit?" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Due"><input type="datetime-local" className="field" value={due} onChange={(e) => setDue(e.target.value)} required /></Field>
          <Field label="Maximum marks"><input type="number" min={1} max={1000} className="field" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} required /></Field>
        </div>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-quiet" onClick={onClose}>Cancel</button>
          <SubmitButton type="submit" busy={busy}>Publish assignment</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function GradeRow({ row, max, onSaved }: { row: SubmissionsPayload['rows'][number]; max: number; onSaved: () => void }) {
  const toast = useToast();
  const s = row.submission;
  const [marks, setMarks] = useState(s?.marks?.toString() ?? '');
  const [feedback, setFeedback] = useState(s?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!s) return;
    setBusy(true); setError('');
    try {
      await api(`/submissions/${s.id}/grade`, { method: 'POST', body: { marks: Number(marks), feedback } });
      toast(`Grade saved for ${row.name}.`);
      onSaved();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save the grade.'); }
    finally { setBusy(false); }
  };

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{row.name}</p><p className="text-sm text-muted">{row.rollNo}</p></div>
        {!s ? <Badge>Not submitted</Badge> : s.gradedAt ? <Badge tone="ok">Graded {s.marks}/{max}</Badge> : <Badge tone="warn">Needs grading</Badge>}
      </div>
      {s && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap rounded border border-line bg-paper px-3 py-2.5 text-sm">{s.content}</p>
          <p className="text-xs text-muted">Submitted {fmtDateTime(s.submittedAt)}</p>
          <div className="grid gap-3 sm:grid-cols-[110px_1fr_auto] sm:items-end">
            <Field label={`Marks (of ${max})`}><input type="number" min={0} max={max} className="field" value={marks} onChange={(e) => setMarks(e.target.value)} /></Field>
            <Field label="Feedback"><input className="field" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional comment for the student" /></Field>
            <SubmitButton busy={busy} disabled={marks === ''} onClick={save}>{s.gradedAt ? 'Update grade' : 'Save grade'}</SubmitButton>
          </div>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </li>
  );
}

function ReviewModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useFetch<SubmissionsPayload>(`/assignments/${id}/submissions`);
  return (
    <Modal title={data ? data.assignment.title : 'Submissions'} onClose={onClose} wide>
      {loading ? <Spinner /> : error || !data ? <ErrorNote message={error || 'Could not load submissions.'} onRetry={reload} /> : (
        <>
          <p className="mb-4 text-sm text-muted">{data.assignment.course.code} · {data.assignment.course.name} · due {fmtDateTime(data.assignment.dueDate)} · {data.assignment.maxMarks} marks</p>
          <ul className="divide-y divide-line rounded border border-line">
            {data.rows.map((r) => <GradeRow key={r.studentId + (r.submission?.gradedAt ?? '')} row={r} max={data.assignment.maxMarks} onSaved={() => { reload(); onChanged(); }} />)}
          </ul>
        </>
      )}
    </Modal>
  );
}

function TeacherView() {
  const params = useSearchParams();
  const { data, loading, error, reload } = useFetch<Assignment[]>('/assignments');
  const [creating, setCreating] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(params.get('open'));

  return (
    <>
      <PageHeader title="Assignments" subtitle="Publish work, then review and grade submissions."
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New assignment</button>} />
      <Panel>
        {loading ? <Spinner /> : error ? <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div> : !data?.length ? (
          <Empty title="No assignments yet" hint="Publish your first assignment and students will be notified." action={<button className="btn-primary" onClick={() => setCreating(true)}>New assignment</button>} />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((a) => {
              const waiting = (a.submittedCount ?? 0) - (a.gradedCount ?? 0);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted">{a.course.code} · due {fmtShort(a.dueDate)} · {a.submittedCount}/{a.classSize} submitted · {a.gradedCount} graded</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {waiting > 0 && <Badge tone="warn">{waiting} to grade</Badge>}
                    <button className="btn-quiet" onClick={() => setReviewId(a.id)}>Review submissions</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {creating && <NewAssignmentModal onClose={() => setCreating(false)} onCreated={reload} />}
      {reviewId && <ReviewModal id={reviewId} onClose={() => setReviewId(null)} onChanged={reload} />}
    </>
  );
}

/* ================= Student / Parent ================= */

type State = { label: string; tone: 'neutral' | 'ok' | 'bad' | 'warn' };
function stateOf(a: Assignment): State {
  const s = a.submission;
  if (s?.gradedAt) return { label: `Graded ${s.marks}/${a.maxMarks}`, tone: 'ok' };
  if (s) return { label: 'Submitted', tone: 'neutral' };
  if (new Date(a.dueDate) < new Date()) return { label: 'Overdue', tone: 'bad' };
  return { label: `Due ${relativeDay(a.dueDate)}`, tone: 'warn' };
}

function DetailModal({ a, canSubmit, onClose, onSaved }: { a: Assignment; canSubmit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const s: Submission | null | undefined = a.submission;
  const [content, setContent] = useState(s?.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = !!s?.gradedAt;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/assignments/${a.id}/submit`, { method: 'POST', body: { content } });
      toast(s ? 'Submission updated.' : 'Assignment submitted.');
      onSaved(); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not submit.'); setBusy(false); }
  };

  return (
    <Modal title={a.title} onClose={onClose}>
      <p className="mb-1 text-sm text-muted">{a.course.code} · {a.course.name}</p>
      <p className="mb-4 text-sm text-muted">Due {fmtDateTime(a.dueDate)} · {a.maxMarks} marks</p>
      <p className="mb-5 whitespace-pre-wrap">{a.description}</p>

      {locked && s && (
        <div className="mb-4 rounded border border-ok/30 bg-ok/5 p-4">
          <p className="font-serif text-2xl text-ok">{s.marks}/{a.maxMarks}</p>
          {s.feedback && <p className="mt-1 text-sm">{s.feedback}</p>}
        </div>
      )}

      {canSubmit && !locked ? (
        <form onSubmit={submit} className="space-y-3">
          <Field label={s ? 'Your submission' : 'Your answer'} hint={s ? `Last submitted ${fmtDateTime(s.submittedAt)}. You can update it until it is graded.` : undefined}>
            <textarea className="field min-h-[150px]" value={content} onChange={(e) => setContent(e.target.value)} required placeholder="Write your answer or paste a link to your work" />
          </Field>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={onClose}>Close</button>
            <SubmitButton type="submit" busy={busy}>{s ? 'Update submission' : 'Submit assignment'}</SubmitButton>
          </div>
        </form>
      ) : (
        <>
          {s ? (
            <div>
              <p className="mb-1.5 text-sm font-medium">Submission</p>
              <p className="whitespace-pre-wrap rounded border border-line bg-paper px-3 py-2.5 text-sm">{s.content}</p>
              <p className="mt-1.5 text-xs text-muted">Submitted {fmtDateTime(s.submittedAt)}{new Date(s.submittedAt) > new Date(a.dueDate) && ' · after the due date'}</p>
            </div>
          ) : <p className="text-sm text-muted">Nothing has been submitted yet.</p>}
          <div className="mt-5 flex justify-end"><button className="btn-quiet" onClick={onClose}>Close</button></div>
        </>
      )}
    </Modal>
  );
}

function FamilyView() {
  const { user, activeStudent } = useAuth();
  const { data, loading, error, reload } = useFetch<Assignment[]>(activeStudent ? `/assignments?studentId=${activeStudent.id}` : null);
  const [filter, setFilter] = useState<'todo' | 'done' | 'all'>('todo');
  const [openId, setOpenId] = useState<string | null>(null);
  const isParent = user?.role === 'PARENT';

  const todo = data?.filter((a) => !a.submission) ?? [];
  const done = data?.filter((a) => a.submission) ?? [];
  const shown = filter === 'todo' ? todo : filter === 'done' ? done : data ?? [];
  const open = data?.find((a) => a.id === openId) ?? null;

  return (
    <>
      <PageHeader title="Assignments" subtitle={isParent && activeStudent ? `Work set for ${activeStudent.name}.` : 'Open an assignment to read the instructions and submit your work.'} />
      <div className="mb-4">
        <Segmented label="Filter assignments" value={filter} onChange={setFilter} options={[
          { value: 'todo', label: `To do (${todo.length})` }, { value: 'done', label: `Submitted (${done.length})` }, { value: 'all', label: 'All' },
        ]} />
      </div>
      <Panel>
        {loading ? <Spinner /> : error ? <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div> : shown.length === 0 ? (
          <Empty title={filter === 'todo' ? 'You are all caught up' : 'Nothing here yet'} hint={filter === 'todo' ? 'No pending assignments.' : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((a) => {
              const st = stateOf(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted">{a.course.code} · {a.course.name} · due {fmtShort(a.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <button className="btn-quiet !py-1.5" onClick={() => setOpenId(a.id)}>{isParent || a.submission?.gradedAt ? 'View' : a.submission ? 'Edit' : 'Open'}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {open && <DetailModal key={open.id + (open.submission?.submittedAt ?? '')} a={open} canSubmit={!isParent} onClose={() => setOpenId(null)} onSaved={reload} />}
    </>
  );
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'TEACHER' || user.role === 'ADMIN') return <Suspense fallback={<Spinner />}><TeacherView /></Suspense>;
  return <FamilyView />;
}
