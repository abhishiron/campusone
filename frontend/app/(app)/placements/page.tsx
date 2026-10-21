'use client';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Async, Avatar, Empty, Panel, Pill, Stat, useAction } from '@/components/ui';
import type { Drive } from '@/lib/types';

export default function PlacementsPage() {
  usePage('Placements', 'Training and Placement Cell, internship season 2026');
  const state = useFetch<{ cgpa: number; backlogs: number; drives: Drive[] }>('/placements');
  const { busy, run } = useAction();
  const toggle = (d: Drive) =>
    run(() => api<{ registered: boolean }>(`/placements/${d.id}/register`, { method: 'POST' }), (r) => (r.registered ? `Registered for ${d.company}. Test details will come as a notification.` : `Withdrawn from ${d.company}`)).then(state.reload);
  return (
    <Async state={state}>
      {(p) => {
        const eligible = p.drives.filter((d) => d.cgpaOk && d.backlogsOk && !d.closed).length;
        const reg = p.drives.filter((d) => d.registered).length;
        return (
          <>
            <div className="stats">
              <Stat label="Your CGPA" value={p.cgpa.toFixed(2)} note="Used for eligibility" />
              <Stat label="Eligible drives" value={`${eligible} of ${p.drives.length}`} note="Open for registration" />
              <Stat label="Registered" value={reg} note={reg ? 'Watch your notifications for test links' : 'Register before the deadline'} />
            </div>
            <div className="mt">
              <Panel title="Open drives">
                {p.drives.length ? (
                  <ul className="list">
                    {p.drives.map((d) => {
                      const ok = d.cgpaOk && d.backlogsOk;
                      return (
                        <li key={d.id}>
                          <Avatar name={d.company} lg />
                          <div className="grow">
                            <b>{d.company}</b><small>{d.role}, {d.pkg}</small>
                            <ul className="checks">
                              <li className={d.cgpaOk ? 'y' : 'n'}>CGPA {p.cgpa.toFixed(2)} (needs {d.minCgpa.toFixed(1)})</li>
                              <li className={d.backlogsOk ? 'y' : 'n'}>Backlogs {p.backlogs} (max {d.maxBacklogs})</li>
                              <li>{d.closed ? 'Registration closed' : `Apply by ${fmtDate(d.deadline)}, ${d.daysLeft === 0 ? 'today' : `${d.daysLeft} days left`}`}</li>
                            </ul>
                          </div>
                          <Pill tone="acc" className="hide-s">{d.type}</Pill>
                          {d.registered ? (
                            <div className="tools"><Pill tone="ok">Registered</Pill>{!d.closed && <button className="btn sm ghost" disabled={busy} onClick={() => toggle(d)}>Withdraw</button>}</div>
                          ) : d.closed ? <Pill>Closed</Pill> : ok ? <button className="btn sm primary" disabled={busy} onClick={() => toggle(d)}>Register</button> : <Pill tone="bad">Not eligible</Pill>}
                        </li>
                      );
                    })}
                  </ul>
                ) : <Empty>No drives announced yet.</Empty>}
              </Panel>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>Registering shares your profile with the placement cell. Skipping a test you registered for may block you from the next two drives.</p>
          </>
        );
      }}
    </Async>
  );
}
