'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { Empty, ErrorNote, Field, Modal, PageHeader, Panel, Spinner, SubmitButton, useToast } from '@/components/ui';
import type { Classroom, Course, Person } from '@/lib/types';

function NewClass({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/classrooms', { method: 'POST', body: { name } }); toast(`Class ${name} created.`); onCreated(); onClose(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the class.'); setBusy(false); }
  };
  return (
    <Modal title="New class" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Class name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. IT-3" /></Field>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-quiet" onClick={onClose}>Cancel</button><SubmitButton type="submit" busy={busy}>Create class</SubmitButton></div>
      </form>
    </Modal>
  );
}

function NewCourse({ classes, onClose, onCreated }: { classes: Classroom[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { data: teachers } = useFetch<Person[]>('/people?role=TEACHER');
  const [f, setF] = useState({ code: '', name: '', classroomId: classes[0]?.id ?? '', teacherId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/courses', { method: 'POST', body: { ...f, teacherId: f.teacherId || teachers?.[0]?.id } });
      toast(`${f.code.toUpperCase()} was added.`); onCreated(); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the course.'); setBusy(false); }
  };
  return (
    <Modal title="New course" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-[130px_1fr] gap-4">
          <Field label="Code"><input className="field" value={f.code} onChange={set('code')} required placeholder="CS205" /></Field>
          <Field label="Course name"><input className="field" value={f.name} onChange={set('name')} required placeholder="Computer Networks" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Class"><select className="field" value={f.classroomId} onChange={set('classroomId')} required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Teacher"><select className="field" value={f.teacherId || teachers?.[0]?.id || ''} onChange={set('teacherId')} required>{teachers?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        </div>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-quiet" onClick={onClose}>Cancel</button><SubmitButton type="submit" busy={busy}>Create course</SubmitButton></div>
      </form>
    </Modal>
  );
}

export default function ClassesPage() {
  const classes = useFetch<Classroom[]>('/classrooms');
  const courses = useFetch<Course[]>('/courses');
  const [addingClass, setAddingClass] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);

  return (
    <>
      <PageHeader title="Classes & courses" subtitle="Set up classes, then assign a teacher to each course." />
      <div className="space-y-6">
        <Panel title="Classes" action={<button className="btn-quiet !py-1.5" onClick={() => setAddingClass(true)}><Plus size={15} /> New class</button>}>
          {classes.loading ? <Spinner /> : classes.error ? <div className="p-5"><ErrorNote message={classes.error} onRetry={classes.reload} /></div> : !classes.data?.length ? <Empty title="No classes yet" /> : (
            <ul className="divide-y divide-line">
              {classes.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3.5">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted">{c.studentCount} students · {c.courseCount} courses</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Courses" action={<button className="btn-primary !py-1.5" disabled={!classes.data?.length} onClick={() => setAddingCourse(true)}><Plus size={15} /> New course</button>}>
          {courses.loading ? <Spinner /> : courses.error ? <div className="p-5"><ErrorNote message={courses.error} onRetry={courses.reload} /></div> : !courses.data?.length ? <Empty title="No courses yet" hint="Create a class first, then add courses to it." /> : (
            <ul className="divide-y divide-line">
              {courses.data.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                  <div><p className="font-medium">{c.code} · {c.name}</p><p className="text-sm text-muted">{c.classroom}</p></div>
                  <p className="text-sm text-muted">{c.teacher}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {addingClass && <NewClass onClose={() => setAddingClass(false)} onCreated={classes.reload} />}
      {addingCourse && classes.data && <NewCourse classes={classes.data} onClose={() => setAddingCourse(false)} onCreated={() => { courses.reload(); classes.reload(); }} />}
    </>
  );
}
