'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, upload } from '@/lib/api';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { addDaysISO, daysLeft, dueText, fmtDate, fmtLong, fmtSize, todayISO } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Attachments, Avatar, DropZone, Empty, Loading, Modal, Panel, Pill, Track, useAction } from '@/components/ui';
import type { Assignment, Course, Submission } from '@/lib/types';

const MAX_FILES = 5, MAX_MB = 20;

/* ---------------- professor ---------------- */
function CreateModal({ courses, onClose, onDone }: { courses: Course[]; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const add = (list: File[]) => {
    const skipped: string[] = [];
    const next = [...files];
    for (const f of list) {
      if (f.size > MAX_MB * 1048576) { skipped.push(`${f.name} is over ${MAX_MB} MB`); continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= MAX_FILES) { skipped.push(`only ${MAX_FILES} files can be attached`); break; }
      next.push(f);
    }
    setFiles(next);
    setErr(skipped.length ? `Some files were not added: ${skipped.join('; ')}.` : '');
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    files.forEach((f) => form.append('files', f));
    const ok = await run(() => upload('/assignments', form), files.length ? `Assignment created with ${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'Assignment created');
    if (ok) onDone();
  };
  return (
    <Modal title="Create assignment" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Title</span><input name="title" required maxLength={100} placeholder="e.g. Write SQL queries for the library schema" /></label>
        <label className="field"><span>Course</span><select name="courseId">{courses.map((c) => <option key={c.id} value={c.id}>{c.code}, {c.name}</option>)}</select></label>
        <div className="row2">
          <label className="field"><span>Due date</span><input name="due" type="date" required min={todayISO()} defaultValue={addDaysISO(7)} /></label>
          <label className="field"><span>Maximum marks</span><input name="maxMarks" type="number" min={1} max={100} defaultValue={10} required /></label>
        </div>
        <label className="field"><span>Instructions (optional)</span><textarea name="description" rows={3} maxLength={2000} /></label>
        <DropZone label={files.length ? `${files.length} of ${MAX_FILES} files attached. Add more` : 'Drag files here or click to browse'} chosen={files.length ? `${files.length} of ${MAX_FILES} files attached. Add more` : undefined}
          hint={`PDF, DOCX, PPTX, ZIP, SQL or image, up to ${MAX_FILES} files, ${MAX_MB} MB each`} accept=".pdf,.zip,.docx,.pptx,.png,.jpg,.jpeg,.txt,.sql" multiple onFiles={add} />
        {files.length > 0 && (
          <ul className="files">
            {files.map((f, i) => (
              <li key={f.name + f.size}><Icon name="file" size={16} /><span>{f.name}</span><small>{fmtSize(f.size)}</small>
                <button type="button" className="icon-btn sm" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><Icon name="x" size={14} /></button></li>
            ))}
          </ul>
        )}
        <p className="err" role="alert">{err}</p>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : 'Create assignment'}</button></div>
      </form>
    </Modal>
  );
}

interface SubsPayload { assignment: { id: string; title: string; dueDate: string; maxMarks: number; course: { code: string; name: string } }; rows: { studentId: string; name: string; rollNo: string; submission: Submission | null }[] }

function GradeRow({ row, max, onSaved }: { row: SubsPayload['rows'][number]; max: number; onSaved: () => void }) {
  const s = row.submission!;
  const [marks, setMarks] = useState(s.marks?.toString() ?? '');
  const [fb, setFb] = useState(s.feedback ?? '');
  const { busy, run } = useAction();
  const save = () => run(() => api(`/submissions/${s.id}/grade`, { method: 'POST', body: { marks: Number(marks), feedback: fb } }), `Graded ${row.name.split(' ')[0]}`).then((r) => r && onSaved());
  return (
    <>
      <td><input className="gm" type="number" min={0} max={max} value={marks} onChange={(e) => setMarks(e.target.value)} aria-label={`Marks for ${row.name}`} /></td>
      <td><input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="Feedback (optional)" aria-label={`Feedback for ${row.name}`} style={{ padding: '7px 10px', fontSize: 13.5 }} /></td>
      <td className="r"><button className="btn sm" disabled={busy || marks === ''} onClick={save}>{s.gradedAt ? 'Update' : 'Grade'}</button></td>
    </>
  );
}

function SubmissionsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const state = useFetch<SubsPayload>(`/assignments/${id}/submissions`);
  return (
    <Modal title={state.data?.assignment.title ?? 'Submissions'} onClose={onClose} wide>
      <Async state={state}>
        {(d) => {
          const subs = d.rows.filter((r) => r.submission);
          return (
            <>
              <div className="asg-meta"><b>{d.assignment.course.code}, {d.assignment.course.name}</b><small>Due {fmtLong(d.assignment.dueDate)}, {d.assignment.maxMarks} marks. {subs.length} of {d.rows.length} submitted, {subs.filter((r) => r.submission!.gradedAt).length} graded.</small></div>
              <div className="tbl-wrap">
                <table className="tbl sm">
                  <thead><tr><th>Student</th><th>Submission</th><th>Marks</th><th>Feedback</th><th className="r"><span className="sr">Save</span></th></tr></thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.studentId}>
                        <td><div className="who"><Avatar name={r.name} /><div><b>{r.name}</b><small className="mono">{r.rollNo}</small></div></div></td>
                        {r.submission ? (
                          <>
                            <td><Attachments files={[r.submission.file]} />{r.submission.note && <div className="hint">{r.submission.note}</div>}<div className="hint">{fmtDate(r.submission.submittedAt)}</div></td>
                            <GradeRow row={r} max={d.assignment.maxMarks} onSaved={state.reload} />
                          </>
                        ) : <td colSpan={4}><span className="hint">Not submitted</span></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </Async>
    </Modal>
  );
}

function TeacherAssignments() {
  usePage('Assignments', 'Create work, track submissions and grade');
  const state = useFetch<Assignment[]>('/assignments');
  const courses = useFetch<Course[]>('/courses');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Panel title="Your assignments" flush extra={<button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={16} />Create assignment</button>}>
        <Async state={state}>
          {(list) => list.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Assignment</th><th>Due</th><th>Submissions</th><th>Max marks</th></tr></thead>
                <tbody>
                  {list.map((a) => {
                    const d = daysLeft(a.dueDate);
                    return (
                      <tr key={a.id} className="click" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) setOpen(a.id); }}>
                        <td><b>{a.title}</b><div className="hint">{a.course.code}, {a.course.name}</div><Attachments files={a.files} /></td>
                        <td>{fmtDate(a.dueDate)} <Pill tone={d < 0 ? '' : d <= 3 ? 'warn' : 'acc'}>{d < 0 ? 'Closed' : d === 0 ? 'Today' : `${d} days left`}</Pill></td>
                        <td style={{ minWidth: 170 }}><Track pct={a.classSize ? (a.submittedCount! / a.classSize) * 100 : 0} /><span className="hint">{a.submittedCount} of {a.classSize}, {a.gradedCount} graded</span></td>
                        <td>{a.maxMarks}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty>No assignments yet. Create the first one.</Empty>}
        </Async>
      </Panel>
      <p className="hint" style={{ marginTop: 10 }}>Select an assignment to see submissions and grade them.</p>
      {creating && <CreateModal courses={courses.data ?? []} onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
      {open && <SubmissionsModal id={open} onClose={() => { setOpen(null); state.reload(); }} />}
    </>
  );
}

/* ---------------- student and parent ---------------- */
function status(a: Assignment) {
  const s = a.submission, d = daysLeft(a.dueDate), closed = new Date(a.dueDate) < new Date();
  if (s?.gradedAt) return { tone: 'ok' as const, text: `Graded ${s.marks}/${a.maxMarks}`, done: true };
  if (s) return { tone: 'ok' as const, text: 'Submitted', done: closed };
  if (closed) return { tone: 'bad' as const, text: 'Missed', done: true };
  return { tone: d <= 3 ? ('warn' as const) : ('acc' as const), text: dueText(a.dueDate), done: false };
}

function SubmitModal({ a, onClose, onDone }: { a: Assignment; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return setErr('Choose a file to submit.');
    const form = new FormData();
    form.append('file', file);
    form.append('note', String(new FormData(e.currentTarget).get('note') ?? ''));
    const ok = await run(() => upload(`/assignments/${a.id}/submit`, form), a.submission ? 'Submission updated' : 'Assignment submitted');
    if (ok) onDone();
  };
  return (
    <Modal title={a.submission ? 'Update submission' : 'Submit assignment'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="asg-meta"><b>{a.title}</b><small>{a.course.code}, {a.course.name}. Due {fmtDate(a.dueDate)}, {a.maxMarks} marks</small></div>
        <DropZone label="Choose a file or drop it here" chosen={file?.name} hint="PDF, DOCX, ZIP or image, up to 20 MB" accept=".pdf,.zip,.docx,.png,.jpg,.jpeg" onFiles={(f) => { setFile(f[0] ?? null); setErr(''); }} />
        <label className="field"><span>Note to your professor (optional)</span><textarea name="note" rows={3} defaultValue={a.submission?.note} /></label>
        <p className="err" role="alert">{err}</p>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : a.submission ? 'Replace submission' : 'Submit assignment'}</button></div>
      </form>
    </Modal>
  );
}

function StudentAssignments({ parent }: { parent: boolean }) {
  usePage('Assignments', parent ? 'Work set for your child and its status' : 'Submit work before the due date');
  const { sep, ready } = useStudentQuery();
  const state = useFetch<Assignment[]>(ready ? sep('/assignments') : null);
  const [submitting, setSubmitting] = useState<Assignment | null>(null);
  // Links like /assignments?submit=<id> from the overview open the submit dialog directly.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('submit');
    const a = id && state.data?.find((x) => x.id === id);
    if (a && !parent && !status(a).done) setSubmitting(a);
  }, [state.data, parent]);
  if (!state.data && !state.error) return <Loading />;
  return (
    <Panel title="All assignments" flush>
      <Async state={state}>
        {(data) => {
          const list = [...data].sort((x, y) => {
            const a = status(x).done, b = status(y).done;
            return a === b ? (a ? y.dueDate.localeCompare(x.dueDate) : x.dueDate.localeCompare(y.dueDate)) : a ? 1 : -1;
          });
          return list.length ? (
            <ul className="list" style={{ padding: '0 18px' }}>
              {list.map((a) => {
                const st = status(a), s = a.submission;
                return (
                  <li key={a.id}>
                    <div className="grow">
                      <b>{a.title}</b>
                      <small>{a.course.code}, {a.course.name}. Due {fmtDate(a.dueDate)}, {a.maxMarks} marks{s ? `. Sent ${fmtDate(s.submittedAt)}` : ''}</small>
                      {a.description && <div className="hint">{a.description}</div>}
                      <Attachments files={[...a.files, s?.file]} />
                      {s?.feedback && <div className="hint">Feedback: {s.feedback}</div>}
                    </div>
                    <Pill tone={st.tone}>{st.text}</Pill>
                    {!parent && !st.done && !s?.gradedAt && <button className={`btn sm ${s ? '' : 'primary'}`} onClick={() => setSubmitting(a)}>{s ? 'Replace' : 'Submit'}</button>}
                  </li>
                );
              })}
            </ul>
          ) : <Empty>No assignments yet.</Empty>;
        }}
      </Async>
      {submitting && <SubmitModal a={submitting} onClose={() => setSubmitting(null)} onDone={() => { setSubmitting(null); state.reload(); }} />}
    </Panel>
  );
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  if (user!.role === 'TEACHER') return <TeacherAssignments />;
  if (user!.role === 'ADMIN') return <Empty>Assignments are managed by professors.</Empty>;
  return <StudentAssignments parent={user!.role === 'PARENT'} />;
}
