'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, upload } from '@/lib/api';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { ago, dRange, parseISO, todayISO } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Attachments, Avatar, DropZone, Empty, Panel, Pill, useAction } from '@/components/ui';
import type { Certificate, Leave, LeavesPayload } from '@/lib/types';

const statusPill = (s: string) => <Pill tone={s === 'APPROVED' || s === 'READY' ? 'ok' : s === 'REJECTED' ? 'bad' : 'warn'}>{({ APPROVED: 'Approved', REJECTED: 'Rejected', PENDING: 'Pending', READY: 'Ready to collect', PROCESSING: 'Processing' } as Record<string, string>)[s] ?? s}</Pill>;
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

function LeaveForm({ types, onDone }: { types: string[]; onDone: () => void }) {
  const { busy, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(0);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const from = String(form.get('from')), to = String(form.get('to')), reason = String(form.get('reason')).trim();
    if (!from || !to || !reason) return setErr('Fill in the dates and a reason.');
    if (to < from) return setErr('The end date is before the start date. Check the dates.');
    const n = Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 864e5) + 1;
    if (form.get('type') === 'Medical leave' && !file && n > 2) return setErr('Medical leave longer than 2 days needs a medical certificate. Attach it above.');
    setErr('');
    if (file) form.append('file', file);
    if (await run(() => upload('/leaves', form), 'Leave request sent to your class coordinator')) { setFile(null); setKey((k) => k + 1); onDone(); }
  };
  return (
    <form key={key} onSubmit={submit}>
      <label className="field"><span>Type</span><select name="type">{types.map((t) => <option key={t}>{t}</option>)}</select></label>
      <div className="row2">
        <label className="field"><span>From</span><input type="date" name="from" required defaultValue={todayISO()} /></label>
        <label className="field"><span>To</span><input type="date" name="to" required defaultValue={todayISO()} /></label>
      </div>
      <label className="field"><span>Reason</span><textarea name="reason" rows={3} required maxLength={300} placeholder="e.g. Viral fever, advised rest by the doctor" /></label>
      <DropZone label="Attach proof, like a medical certificate" chosen={file?.name} hint="PDF or photo, up to 10 MB" accept=".pdf,.jpg,.jpeg,.png" onFiles={(f) => setFile(f[0] ?? null)} />
      <p className="err" role="alert">{err}</p>
      <div className="actions"><button className="btn primary" disabled={busy}>Send request</button></div>
    </form>
  );
}

function CertForm({ types, onDone }: { types: string[]; onDone: () => void }) {
  const { busy, run } = useAction();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.currentTarget, d = new FormData(el);
    if (await run(() => api('/certificates', { method: 'POST', body: { type: d.get('type'), purpose: String(d.get('purpose')).trim() } }), 'Requested. Certificates are usually ready in 2 working days.')) { el.reset(); onDone(); }
  };
  return (
    <form onSubmit={submit}>
      <label className="field"><span>Certificate</span><select name="type">{types.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>Purpose</span><input name="purpose" required minLength={3} maxLength={80} placeholder="e.g. Passport application" /></label>
      <div className="actions"><button className="btn primary" disabled={busy}>Request certificate</button></div>
    </form>
  );
}

const CertList = ({ list, coordinator, onReady, busy }: { list: Certificate[]; coordinator?: boolean; onReady?: (c: Certificate) => void; busy?: boolean }) =>
  list.length ? (
    <ul className="list">
      {list.map((c) => (
        <li key={c.id}>
          <span className="ico"><Icon name="file" size={16} /></span>
          <div className="grow"><b>{c.type}</b><small>{coordinator ? `${c.name}, ` : ''}for {c.purpose}, requested {ago(c.createdAt)}</small></div>
          {coordinator && c.status === 'PROCESSING' ? <button className="btn sm" disabled={busy} onClick={() => onReady!(c)}>Mark ready</button> : statusPill(c.status)}
        </li>
      ))}
    </ul>
  ) : <Empty>No certificate requests yet.</Empty>;

function TeacherLeaves() {
  usePage('Leave requests', 'Requests from the sections you coordinate');
  const state = useFetch<LeavesPayload>('/leaves');
  const certs = useFetch<Certificate[]>('/certificates');
  const { busy, run } = useAction();
  const decide = (l: Leave, status: 'APPROVED' | 'REJECTED') =>
    run(() => api(`/leaves/${l.id}/decide`, { method: 'POST', body: { status } }), `${status === 'APPROVED' ? 'Approved' : 'Rejected'}. ${l.name.split(' ')[0]} has been notified.`).then(state.reload);
  const ready = (c: Certificate) => run(() => api(`/certificates/${c.id}/ready`, { method: 'POST' }), `${c.name.split(' ')[0]} has been told to collect it.`).then(certs.reload);
  return (
    <Async state={state}>
      {(d) => {
        const list = [...d.leaves].sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1));
        const pend = list.filter((l) => l.status === 'PENDING').length;
        return (
          <>
            <Panel title={`${pend} waiting for you`}>
              {list.length ? (
                <ul className="list">
                  {list.map((l) => (
                    <li key={l.id}>
                      <Avatar name={l.name} />
                      <div className="grow">
                        <b>{l.name}</b><small>{l.type}, {dRange(l.from, l.to)} ({days(l.days)})</small>
                        <p className="reason">{l.reason}</p>
                        <Attachments files={[l.file]} />
                      </div>
                      {l.status === 'PENDING' ? (
                        <div className="tools">
                          <button className="btn sm" disabled={busy} onClick={() => decide(l, 'REJECTED')}>Reject</button>
                          <button className="btn sm primary" disabled={busy} onClick={() => decide(l, 'APPROVED')}>Approve</button>
                        </div>
                      ) : statusPill(l.status)}
                    </li>
                  ))}
                </ul>
              ) : <Empty>No leave requests. You only see requests from sections you coordinate.</Empty>}
            </Panel>
            <div className="mt"><Panel title="Certificate requests">{certs.data ? <CertList list={certs.data} coordinator onReady={ready} busy={busy} /> : null}</Panel></div>
          </>
        );
      }}
    </Async>
  );
}

function StudentLeaves({ parent }: { parent: boolean }) {
  const { sep, ready } = useStudentQuery();
  const state = useFetch<LeavesPayload>(ready ? sep('/leaves') : null);
  const certs = useFetch<Certificate[]>(ready ? sep('/certificates') : null);
  usePage(parent ? 'Leave requests' : 'Leave and certificates', state.data?.coordinator ? `Requests go to your class coordinator, ${state.data.coordinator}` : undefined);
  return (
    <Async state={state}>
      {(d) => {
        const reqs = d.leaves.length ? (
          <ul className="list">
            {d.leaves.map((l) => (
              <li key={l.id}>
                <div className="grow"><b>{l.type}</b><small>{dRange(l.from, l.to)}, {days(l.days)}. {l.reason}</small><Attachments files={[l.file]} /></div>
                {statusPill(l.status)}
              </li>
            ))}
          </ul>
        ) : <Empty>No leave requests yet.</Empty>;
        if (parent) return <><Panel title="Leave requests">{reqs}</Panel><div className="mt"><Panel title="Certificates">{certs.data ? <CertList list={certs.data} /> : null}</Panel></div></>;
        return (
          <>
            <div className="grid-2" style={{ marginTop: 0 }}>
              <Panel title="My leave requests">{reqs}</Panel>
              <Panel title="Apply for leave"><LeaveForm types={d.types} onDone={state.reload} /></Panel>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>Approved medical and duty leave is taken into account when the HOD decides exam eligibility for subjects below 75%.</p>
            <div className="grid-2">
              <Panel title="Certificates">{certs.data ? <CertList list={certs.data} /> : null}</Panel>
              <Panel title="Request a certificate"><CertForm types={d.certTypes} onDone={certs.reload} /></Panel>
            </div>
          </>
        );
      }}
    </Async>
  );
}

export default function LeavesPage() {
  const { user } = useAuth();
  if (user!.role === 'TEACHER') return <TeacherLeaves />;
  if (user!.role === 'ADMIN') return <Empty>Leave requests go to class coordinators.</Empty>;
  return <StudentLeaves parent={user!.role === 'PARENT'} />;
}
