'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, Modal, Panel, Track, useAction } from '@/components/ui';
import type { Classroom, Course, Person } from '@/lib/types';

function AddCourse({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const classes = useFetch<Classroom[]>('/classrooms');
  const faculty = useFetch<Person[]>('/people?role=TEACHER');
  const { busy, run } = useAction();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const ok = await run(() => api('/courses', { method: 'POST', body: { code: d.get('code'), name: d.get('name'), classroomId: d.get('classroomId'), teacherId: d.get('teacherId'), credits: Number(d.get('credits')) } }), 'Course added');
    if (ok) onDone();
  };
  return (
    <Modal title="Add course" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="row2">
          <label className="field"><span>Code</span><input name="code" required minLength={2} placeholder="e.g. IT-313" /></label>
          <label className="field"><span>Credits</span><select name="credits" defaultValue={4}>{[1, 2, 3, 4, 5, 6].map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className="field"><span>Course name</span><input name="name" required minLength={2} /></label>
        <label className="field"><span>Section</span><select name="classroomId">{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.studentCount} students)</option>)}</select></label>
        <label className="field"><span>Instructor</span><select name="teacherId">{faculty.data?.filter((f) => f.status !== 'SUSPENDED').map((f) => <option key={f.id} value={f.id}>{f.name}, {f.dept}</option>)}</select></label>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Add course</button></div>
      </form>
    </Modal>
  );
}

export default function CoursesPage() {
  usePage('Courses', 'Running this semester, all sections');
  const state = useFetch<Course[]>('/courses');
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Panel title="Running this semester" flush extra={<button className="btn primary sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add course</button>}>
        <Async state={state}>
          {(list) => list.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Code</th><th>Course</th><th>Section</th><th>Instructor</th><th>Credits</th><th>Enrolled</th></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td><span className="mono">{c.code}</span></td><td><b>{c.name}</b></td><td>{c.classroom}</td>
                      <td><div className="who"><Avatar name={c.teacher} /><span>{c.teacher}</span></div></td>
                      <td>{c.credits}</td>
                      <td style={{ minWidth: 160 }}><div className="hbar" style={{ gridTemplateColumns: '1fr 60px', margin: 0 }}><Track pct={(c.enrolled / c.capacity) * 100} /><b>{c.enrolled}/{c.capacity}</b></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No courses yet.</Empty>}
        </Async>
      </Panel>
      {adding && <AddCourse onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
