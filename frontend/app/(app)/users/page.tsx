'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, Modal, Pill, useAction } from '@/components/ui';
import type { Person } from '@/lib/types';

const DEPTS = ['IT', 'CSE', 'ECE', 'EEE', 'ME', 'Civil'];
const statusPill = (s: string) => <Pill tone={s === 'ACTIVE' ? 'ok' : s === 'SUSPENDED' ? 'bad' : 'warn'}>{({ ACTIVE: 'Active', SUSPENDED: 'Suspended', ON_LEAVE: 'On leave' } as Record<string, string>)[s] ?? s}</Pill>;

function AddUser({ role, onClose, onDone }: { role: 'STUDENT' | 'TEACHER'; onClose: () => void; onDone: (r: 'STUDENT' | 'TEACHER') => void }) {
  const { busy, run } = useAction();
  const [created, setCreated] = useState<{ name: string; email: string; rollNo: string | null; tempPassword: string; role: 'STUDENT' | 'TEACHER' } | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = d.get('role') as 'STUDENT' | 'TEACHER';
    const res = await run(() => api<{ name: string; email: string; rollNo: string | null; tempPassword: string }>('/people', { method: 'POST', body: { name: String(d.get('name')).trim(), email: String(d.get('email')).trim(), role: r, dept: d.get('dept') } }), (x) => `${x.name} added`);
    if (res) setCreated({ ...res, role: r });
  };
  if (created) {
    return (
      <Modal title="Account created" onClose={() => onDone(created.role)}>
        <p style={{ marginBottom: 12 }}>Share these sign-in details with {created.name}. The password is shown only once.</p>
        <dl className="kv">
          <dt>Sign in with</dt><dd className="mono">{created.rollNo ?? created.email}</dd>
          {created.rollNo && <><dt>Email</dt><dd className="mono">{created.email}</dd></>}
          <dt>Temporary password</dt><dd className="mono">{created.tempPassword}</dd>
        </dl>
        <div className="actions"><button className="btn primary" onClick={() => onDone(created.role)}>Done</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Full name</span><input name="name" required minLength={2} autoComplete="off" /></label>
        <label className="field"><span>Institute email</span><input name="email" type="email" required placeholder="name@msit.edu" autoComplete="off" /></label>
        <div className="row2">
          <label className="field"><span>Role</span><select name="role" defaultValue={role}><option value="STUDENT">Student</option><option value="TEACHER">Faculty</option></select></label>
          <label className="field"><span>Department</span><select name="dept">{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></label>
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>Students are placed in their department&apos;s first section and get an enrollment number. A temporary password is generated for you to hand over.</p>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Add user</button></div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  usePage('Users', 'Student and faculty accounts');
  const [tab, setTab] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const counts = useFetch<{ students: number; faculty: number }>('/people/counts');
  const state = useFetch<Person[]>(`/people?role=${tab}&q=${encodeURIComponent(debounced)}`);
  const { busy, run } = useAction();
  const toggle = (u: Person) => {
    const status = u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    run(() => api(`/people/${u.id}/status`, { method: 'PATCH', body: { status } }), `${u.name} ${status === 'ACTIVE' ? 'activated' : 'suspended'}`).then(state.reload);
  };

  return (
    <section className="card">
      <header className="card-h">
        <div className="tabs" role="tablist">
          {([['STUDENT', 'Students', counts.data?.students], ['TEACHER', 'Faculty', counts.data?.faculty]] as const).map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setQ(''); }}>{l}<span>{n ?? ''}</span></button>
          ))}
        </div>
        <div className="tools">
          <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or ID" aria-label="Search users" /></label>
          <button className="btn primary sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add user</button>
        </div>
      </header>
      <div className="tbl-wrap">
        <Async state={state}>
          {(list) => list.length ? (
            <table className="tbl">
              <thead><tr><th>Name</th><th>{tab === 'STUDENT' ? 'Enrollment no.' : 'Designation'}</th><th>{tab === 'STUDENT' ? 'Section' : 'Department'}</th><th>Status</th><th className="r"><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td><div className="who"><Avatar name={u.name} /><div><b>{u.name}</b><small>{u.email}</small></div></div></td>
                    <td>{tab === 'STUDENT' ? <span className="mono">{u.rollNo}</span> : u.designation}</td>
                    <td>{tab === 'STUDENT' ? u.classroom : u.dept}</td>
                    <td>{statusPill(u.status)}</td>
                    <td className="r"><button className="btn sm ghost" disabled={busy} onClick={() => toggle(u)}>{u.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>{debounced ? `No ${tab === 'STUDENT' ? 'students' : 'faculty'} match "${debounced}". Check the spelling or clear the search.` : 'No accounts yet.'}</Empty>}
        </Async>
      </div>
      {adding && <AddUser role={tab} onClose={() => setAdding(false)} onDone={(r) => { setAdding(false); setTab(r); setQ(''); state.reload(); counts.reload(); }} />}
    </section>
  );
}
