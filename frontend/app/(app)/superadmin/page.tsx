'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, Modal, Pill, Stat, useAction } from '@/components/ui';

const PLANS = ['FREE', 'PRO', 'INSTITUTION'] as const;
const ROLE_LABEL: Record<string, string> = { SUPERADMIN: 'Super admin', ADMIN: 'Admin', SCHOOL: 'School', TEACHER: 'Faculty', STUDENT: 'Student', PARENT: 'Parent' };
const PAGE_SIZE = 25;

interface Subscriber {
  id: string; plan: string; status: string; startedAt: string; expiresAt: string; daysLeft: number;
  user: { id: string; name: string; email: string; role: string };
}
interface SubscribersResponse {
  liveTotal: number; total: number; page: number; pageSize: number; byPlan: Record<string, number>; subscribers: Subscriber[];
}
interface CreatedSchool { user: { id: string; name: string; email: string; role: string }; subscription: { plan: string; expiresAt: string }; tempPassword: string }

type Action = { kind: 'renew' | 'cancel' | 'reset'; sub: Subscriber };

/** Renew, cancel, or reset a school's password. Each one confirms first; a reset shows the new password once. */
function SubscriberAction({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [temp, setTemp] = useState<string | null>(null);
  const { kind, sub } = action;
  const who = sub.user.name;

  if (temp) {
    return (
      <Modal title="New temporary password" onClose={onDone}>
        <p style={{ marginBottom: 12 }}>Share this with {who}. It is shown only once, and they must choose their own password when they sign in.</p>
        <dl className="kv"><dt>Email</dt><dd className="mono">{sub.user.email}</dd><dt>Temporary password</dt><dd className="mono">{temp}</dd></dl>
        <div className="actions"><button className="btn primary" onClick={onDone}>Done</button></div>
      </Modal>
    );
  }

  if (kind === 'renew') {
    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const days = Number(new FormData(e.currentTarget).get('durationDays'));
      const res = await run(() => api<{ expiresAt: string }>(`/superadmin/subscriptions/${sub.id}/renew`, { method: 'POST', body: { durationDays: days } }), (r) => `${who} renewed until ${date(r.expiresAt)}`);
      if (res) onDone();
    };
    return (
      <Modal title={`Renew ${who}`} onClose={onClose}>
        <form onSubmit={submit}>
          <p style={{ marginBottom: 12 }}>The {sub.plan} plan currently ends on {date(sub.expiresAt)}. Extra days are added after that date.</p>
          <label className="field"><span>Add days</span><input name="durationDays" type="number" required min={1} max={3650} defaultValue={365} /></label>
          <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Renew</button></div>
        </form>
      </Modal>
    );
  }

  if (kind === 'cancel') {
    const confirm = async () => {
      const res = await run(() => api(`/superadmin/subscriptions/${sub.id}/cancel`, { method: 'POST' }), `${who}'s plan ended`);
      if (res) onDone();
    };
    return (
      <Modal title={`End ${who}'s plan?`} onClose={onClose}>
        <p style={{ marginBottom: 14 }}>The {sub.plan} plan ends now and {who} leaves the live subscriber list. The account and its data are kept, and you can add a new plan later.</p>
        <div className="actions"><button className="btn" onClick={onClose}>Keep plan</button><button className="btn primary" disabled={busy} onClick={confirm}>End plan</button></div>
      </Modal>
    );
  }

  const reset = async () => {
    const res = await run(() => api<{ tempPassword: string }>(`/superadmin/schools/${sub.user.id}/reset-password`, { method: 'POST' }));
    if (res) setTemp(res.tempPassword);
  };
  return (
    <Modal title={`Reset ${who}'s password?`} onClose={onClose}>
      <p style={{ marginBottom: 14 }}>Their current password stops working straight away. You get a new temporary password to hand over.</p>
      <div className="actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={reset}>Reset password</button></div>
    </Modal>
  );
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const leftTone = (d: number) => (d <= 7 ? 'bad' : d <= 30 ? 'warn' : 'ok');

function AddSchool({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [created, setCreated] = useState<CreatedSchool | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const res = await run(
      () => api<CreatedSchool>('/superadmin/schools', { method: 'POST', body: { name: String(d.get('name')).trim(), email: String(d.get('email')).trim(), plan: d.get('plan'), durationDays: Number(d.get('durationDays')) } }),
      (x) => `${x.user.name} added`,
    );
    if (res) setCreated(res);
  };
  if (created) {
    return (
      <Modal title="School created" onClose={onDone}>
        <p style={{ marginBottom: 12 }}>Share these sign-in details with {created.user.name}. The password is shown only once, and they must choose their own when they first sign in.</p>
        <dl className="kv">
          <dt>Email</dt><dd className="mono">{created.user.email}</dd>
          <dt>Temporary password</dt><dd className="mono">{created.tempPassword}</dd>
          <dt>Plan</dt><dd>{created.subscription.plan}, until {date(created.subscription.expiresAt)}</dd>
        </dl>
        <div className="actions"><button className="btn primary" onClick={onDone}>Done</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Add school" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>School name</span><input name="name" required minLength={2} maxLength={120} autoComplete="off" /></label>
        <label className="field"><span>Login email</span><input name="email" type="email" required autoComplete="off" /></label>
        <div className="row2">
          <label className="field"><span>Plan</span><select name="plan" defaultValue="INSTITUTION">{PLANS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="field"><span>Duration (days)</span><input name="durationDays" type="number" required min={1} max={3650} defaultValue={365} /></label>
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>A temporary password is generated for you to hand over.</p>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Add school</button></div>
      </form>
    </Modal>
  );
}

export default function SuperAdminPage() {
  usePage('Subscribers', 'Everyone with a live subscription');
  const { user } = useAuth();
  const [plan, setPlan] = useState('');
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);

  const isSuper = user?.role === 'SUPERADMIN';
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (plan) qs.set('plan', plan);
  if (role) qs.set('role', role);
  if (debounced) qs.set('q', debounced);
  const state = useFetch<SubscribersResponse>(isSuper ? `/superadmin/subscribers?${qs}` : null);

  if (!isSuper) return <Empty>This page is only for the platform super admin.</Empty>;

  return (
    <>
      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat label="Live subscribers" value={state.data?.liveTotal ?? '—'} />
        {PLANS.map((p) => <Stat key={p} label={p === 'INSTITUTION' ? 'Institution' : p === 'PRO' ? 'Pro' : 'Free'} value={state.data?.byPlan[p] ?? '—'} />)}
      </div>
      <section className="card">
        <header className="card-h">
          <h2>Live subscribers</h2>
          <div className="tools">
            <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search subscribers" /></label>
            <select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} aria-label="Filter by plan">
              <option value="">All plans</option>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Filter by role">
              <option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn primary sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add school</button>
          </div>
        </header>
        <div className="tbl-wrap">
          <Async state={state}>
            {(d) => d.subscribers.length ? (
              <>
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Role</th><th>Plan</th><th>Expires on</th><th>Days left</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {d.subscribers.map((s) => (
                      <tr key={s.id}>
                        <td><div className="who"><Avatar name={s.user.name} /><div><b>{s.user.name}</b><small>{s.user.email}</small></div></div></td>
                        <td>{ROLE_LABEL[s.user.role] ?? s.user.role}</td>
                        <td><Pill tone="acc">{s.plan}</Pill></td>
                        <td>{date(s.expiresAt)}</td>
                        <td><Pill tone={leftTone(s.daysLeft)}>{s.daysLeft} {s.daysLeft === 1 ? 'day' : 'days'}</Pill></td>
                        <td>
                          <div className="tools" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <button className="btn sm" onClick={() => setAction({ kind: 'renew', sub: s })} aria-label={`Renew ${s.user.name}`}>Renew</button>
                            {s.user.role === 'SCHOOL' && <button className="btn sm" onClick={() => setAction({ kind: 'reset', sub: s })} aria-label={`Reset password for ${s.user.name}`}>Reset</button>}
                            <button className="btn sm" onClick={() => setAction({ kind: 'cancel', sub: s })} aria-label={`End plan for ${s.user.name}`}>End plan</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="tools" style={{ padding: '12px 18px', justifyContent: 'space-between' }}>
                  <small>Showing {(d.page - 1) * d.pageSize + 1}–{Math.min(d.page * d.pageSize, d.total)} of {d.total}</small>
                  <div className="tools">
                    <button className="btn sm" disabled={d.page <= 1} onClick={() => setPage(d.page - 1)}>Previous</button>
                    <button className="btn sm" disabled={d.page * d.pageSize >= d.total} onClick={() => setPage(d.page + 1)}>Next</button>
                  </div>
                </div>
              </>
            ) : <Empty>{debounced || plan || role ? 'No live subscribers match these filters. Clear a filter or the search.' : 'No live subscribers yet. Add a school to get started.'}</Empty>}
          </Async>
        </div>
      </section>
      {action && <SubscriberAction action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); state.reload(); }} />}
      {adding && <AddSchool onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
    </>
  );
}
