'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { ConfirmModal, Empty, ErrorNote, Field, Modal, PageHeader, Panel, Segmented, Spinner, SubmitButton, useToast } from '@/components/ui';
import type { Classroom, Person } from '@/lib/types';

type Kind = 'STUDENT' | 'TEACHER' | 'PARENT';
const NOUN: Record<Kind, string> = { STUDENT: 'student', TEACHER: 'teacher', PARENT: 'parent' };

function AddPerson({ kind, onClose, onCreated }: { kind: Kind; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { data: classes } = useFetch<Classroom[]>(kind === 'STUDENT' ? '/classrooms' : null);
  const { data: parents } = useFetch<Person[]>(kind === 'STUDENT' ? '/people?role=PARENT' : null);
  const [f, setF] = useState({ name: '', email: '', password: '', classroomId: '', rollNo: '', parentId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body: any = { role: kind, name: f.name, email: f.email, password: f.password };
      if (kind === 'STUDENT') Object.assign(body, { classroomId: f.classroomId || classes?.[0]?.id, rollNo: f.rollNo, parentId: f.parentId || undefined });
      await api('/people', { method: 'POST', body });
      toast(`${f.name} was added as a ${NOUN[kind]}.`);
      onCreated(); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not add this person.'); setBusy(false); }
  };

  return (
    <Modal title={`Add ${NOUN[kind]}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Full name"><input className="field" value={f.name} onChange={set('name')} required minLength={2} /></Field>
        <Field label="Email"><input type="email" className="field" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Temporary password" hint="At least 6 characters. Share it with them so they can sign in."><input type="text" className="field" value={f.password} onChange={set('password')} required minLength={6} /></Field>
        {kind === 'STUDENT' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Class">
                <select className="field" value={f.classroomId || classes?.[0]?.id || ''} onChange={set('classroomId')} required>
                  {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Roll number"><input className="field" value={f.rollNo} onChange={set('rollNo')} required placeholder="IT1-009" /></Field>
            </div>
            <Field label="Parent (optional)">
              <select className="field" value={f.parentId} onChange={set('parentId')}>
                <option value="">No parent linked</option>
                {parents?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-quiet" onClick={onClose}>Cancel</button>
          <SubmitButton type="submit" busy={busy}>Add {NOUN[kind]}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export default function PeoplePage() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('STUDENT');
  const { data, loading, error, reload } = useFetch<Person[]>(`/people?role=${kind}`);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/people/${deleting.id}`, { method: 'DELETE' }); toast(`${deleting.name} was removed.`); setDeleting(null); reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not remove this person.', 'error'); setDeleting(null); }
    finally { setBusy(false); }
  };

  const detail = (p: Person) =>
    p.role === 'STUDENT' ? `${p.rollNo} · ${p.classroom}${p.parentName ? ` · Parent: ${p.parentName}` : ''}`
    : p.role === 'TEACHER' ? `${p.courseCount} ${p.courseCount === 1 ? 'course' : 'courses'}`
    : `${p.childCount} ${p.childCount === 1 ? 'child' : 'children'}`;

  return (
    <>
      <PageHeader title="People" subtitle="Add and manage students, teachers and parents."
        action={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add {NOUN[kind]}</button>} />
      <div className="mb-4">
        <Segmented label="Type of person" value={kind} onChange={setKind} options={[
          { value: 'STUDENT', label: 'Students' }, { value: 'TEACHER', label: 'Teachers' }, { value: 'PARENT', label: 'Parents' },
        ]} />
      </div>
      <Panel>
        {loading ? <Spinner /> : error ? <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div> : !data?.length ? (
          <Empty title={`No ${NOUN[kind]}s yet`} action={<button className="btn-primary" onClick={() => setAdding(true)}>Add {NOUN[kind]}</button>} />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="truncate text-sm text-muted">{p.email} · {detail(p)}</p>
                </div>
                <button aria-label={`Remove ${p.name}`} className="rounded p-2 text-muted hover:bg-bad/10 hover:text-bad" onClick={() => setDeleting(p)}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {adding && <AddPerson kind={kind} onClose={() => setAdding(false)} onCreated={reload} />}
      {deleting && <ConfirmModal title={`Remove ${NOUN[kind]}`} message={`${deleting.name} will lose access, and their attendance and submissions will be deleted. This cannot be undone.`} confirmLabel="Remove" busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />}
    </>
  );
}
