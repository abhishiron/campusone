'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { daysLeft, examDay, fmtDate } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon, Logo } from '@/components/Icon';
import { Async, Avatar, Empty, Modal, Panel, Pill, Stat } from '@/components/ui';
import type { ExamsPayload } from '@/lib/types';

const TIPS = [
  'Carry your college ID card and admit card. Entry is not allowed without both.',
  'Reach the hall 20 minutes early. The gate closes 15 minutes after the paper starts.',
  'Phones and smartwatches stay in your bag at the front of the room.',
  'Bring your own calculator for IT-303 and IT-307. Sharing is not allowed.',
];

function AdmitCard({ d }: { d: ExamsPayload }) {
  return (
    <>
      <div className="admit">
        <div className="admit-h"><Logo size={34} /><div><b>Maharaja Surajmal Institute of Technology</b><small>Admit card, mid-semester examination, odd semester 2026</small></div></div>
        <div className="who" style={{ margin: '16px 0' }}><Avatar name={d.student.name} lg /><div><b>{d.student.name}</b><small className="mono">{d.student.rollNo}</small></div></div>
        <dl className="kv"><dt>Programme</dt><dd>{d.student.program}</dd><dt>Semester and section</dt><dd>{d.student.semester}, {d.student.classroom}</dd><dt>Batch</dt><dd>{d.student.batch}</dd></dl>
        <div className="tbl-wrap">
          <table className="tbl sm">
            <thead><tr><th>Date</th><th>Subject</th><th>Room</th><th>Seat</th></tr></thead>
            <tbody>{d.exams.map((e) => <tr key={e.id}><td>{examDay(e.date)}</td><td className="mono">{e.code}</td><td>{e.room}</td><td className="mono">{e.seat}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 12 }}><button className="btn" onClick={() => window.print()}>Print</button></div>
    </>
  );
}

export default function ExamsPage() {
  const { user } = useAuth();
  usePage('Exams', 'Mid-semester examination, odd semester 2026');
  const { sep, ready } = useStudentQuery();
  const state = useFetch<ExamsPayload>(ready ? sep('/exams') : null);
  const [admit, setAdmit] = useState(false);
  return (
    <Async state={state}>
      {(d) => {
        if (!d.exams.length) return <Empty>No exams are scheduled yet.</Empty>;
        const next = d.exams.find((e) => daysLeft(e.date) >= 0);
        const dl = next ? daysLeft(next.date) : 0;
        const short = d.exams.filter((e) => !e.eligible);
        return (
          <>
            <div className="stats">
              <Stat label="Next paper" value={next ? (dl === 0 ? 'Today' : dl === 1 ? 'Tomorrow' : `${dl} days`) : 'Done'} note={next ? `${next.name}, ${examDay(next.date)}` : 'All papers finished'} />
              <Stat label="Papers" value={d.exams.length} note={`${d.exams[0].maxMarks} marks each, 90 minutes`} />
              <Stat label="Attendance clearance" value={short.length ? `${short.length} pending` : 'Cleared'} note={short.length ? `${short.map((e) => e.code).join(', ')} below 75%` : 'Eligible for every paper'} tone={short.length ? 'warn' : undefined} />
            </div>
            {short.length > 0 && (
              <div className="banner warn-b mt">
                <Icon name="alert" size={18} />
                <span>Attendance is below 75% in <b>{short.map((e) => e.code).join(' and ')}</b>. Submit a medical or duty leave with proof, or meet the HOD{d.clearBy ? ` before ${fmtDate(d.clearBy)}` : ''}, to sit these papers.</span>
                {user!.role === 'STUDENT' && <Link className="btn sm" href="/leaves">Apply for leave</Link>}
              </div>
            )}
            <div className="mt">
              <Panel title="Date sheet" flush extra={<button className="btn sm primary" onClick={() => setAdmit(true)}><Icon name="exam" size={16} />View admit card</button>}>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Syllabus</th><th>Room and seat</th><th>Status</th></tr></thead>
                    <tbody>
                      {d.exams.map((e) => (
                        <tr key={e.id}>
                          <td><b>{examDay(e.date)}</b></td><td className="mono">{e.time}</td>
                          <td><b>{e.name}</b><div className="hint mono">{e.code}</div></td><td>{e.syllabus}</td>
                          <td>{e.room}, seat <span className="mono">{e.seat}</span></td>
                          <td>{e.eligible ? <Pill tone="ok">Eligible</Pill> : <Pill tone="warn">Needs HOD approval</Pill>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
            <div className="mt">
              <Panel title="Exam-day checklist">
                <ul className="list">{TIPS.map((t) => <li key={t}><span className="ico"><Icon name="check" size={16} /></span><div className="grow">{t}</div></li>)}</ul>
              </Panel>
            </div>
            {admit && <Modal title="Admit card" onClose={() => setAdmit(false)}><AdmitCard d={d} /></Modal>}
          </>
        );
      }}
    </Async>
  );
}
