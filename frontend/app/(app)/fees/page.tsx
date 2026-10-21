'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { daysLeft, fmtDate, fmtDateTime, fmtLong, inr } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon, Logo } from '@/components/Icon';
import { Async, Empty, Modal, Panel, Pill, Stat, useAction } from '@/components/ui';
import type { Fees } from '@/lib/types';

type Payment = Fees['payments'][number];

export default function FeesPage() {
  const { activeStudent } = useAuth();
  usePage('Fees', activeStudent ? `Semester ${activeStudent.semester}, academic year 2026–27` : 'Semester fee');
  const { q, sep, ready } = useStudentQuery();
  const state = useFetch<Fees>(ready ? sep('/fees') : null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [method, setMethod] = useState('UPI');
  const { busy, run } = useAction();

  const pay = async () => {
    const r = await run(() => api<{ amount: number }>('/fees/pay', { method: 'POST', body: { method, ...(q ? { studentId: activeStudent!.id } : {}) } }), (x) => `Payment of ${inr(x.amount)} recorded`);
    if (r) { setPaying(false); state.reload(); }
  };

  return (
    <Async state={state}>
      {(f) => {
        const d = f.due ? daysLeft(f.due) : null;
        return (
          <>
            <div className="stats">
              <Stat label="Semester fee" value={inr(f.total)} note="Tuition, development, exam and lab" />
              <Stat label="Paid" value={inr(f.paid)} note={`${f.payments.length} ${f.payments.length === 1 ? 'payment' : 'payments'}`} />
              <Stat label="Balance due" value={inr(f.balance)} note={f.balance ? (d === null ? '' : d >= 0 ? `Due by ${fmtDate(f.due!)}, ${d} days left` : `Overdue by ${-d} days`) : 'Fully paid'} tone={f.balance ? 'warn' : undefined} />
            </div>
            <div className="grid-2">
              <Panel title="Fee breakdown" flush extra={f.balance ? <button className="btn sm primary" onClick={() => setPaying(true)}>Pay {inr(f.balance)}</button> : <Pill tone="ok">Paid in full</Pill>}>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <tbody>{f.items.map((i) => <tr key={i.label}><td>{i.label}</td><td className="r mono">{inr(i.amount)}</td></tr>)}</tbody>
                    <tfoot>
                      <tr><td>Total</td><td className="r mono">{inr(f.total)}</td></tr>
                      <tr><td>Paid</td><td className="r mono">− {inr(f.paid)}</td></tr>
                      <tr><td>Balance</td><td className="r mono">{inr(f.balance)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
              <Panel title="Payment history">
                {f.payments.length ? (
                  <ul className="list">
                    {f.payments.map((p) => (
                      <li key={p.txn}>
                        <span className="ico"><Icon name="rupee" size={16} /></span>
                        <div className="grow"><b>{inr(p.amount)}</b><small>{fmtLong(p.createdAt)}, {p.method}, paid by {p.paidBy}, <span className="mono">{p.txn}</span></small></div>
                        <button className="btn sm" onClick={() => setReceipt(p)}>Receipt</button>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>No payments yet.</Empty>}
              </Panel>
            </div>
            <p className="hint" style={{ marginTop: 12 }}>A late fee of ₹100 per day applies after the due date. Scholarship students should upload their sanction letter at the accounts office.</p>

            {paying && (
              <Modal title="Pay semester fee" onClose={() => setPaying(false)}>
                <div className="asg-meta"><b>{inr(f.balance)}</b><small>Balance for semester {f.student.semester}{f.due ? `, due ${fmtDate(f.due)}` : ''}</small></div>
                <div className="radio-row" role="radiogroup" aria-label="Payment method">
                  {['UPI', 'Debit card', 'Net banking'].map((m) => <label key={m} className="radio"><input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />{m}</label>)}
                </div>
                <p className="hint" style={{ marginBottom: 14 }}>Demo only: no money is charged, the payment is recorded straight away. A production build would hand off to the bank&apos;s payment gateway here.</p>
                <div className="actions"><button className="btn" onClick={() => setPaying(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={pay}>{busy ? 'Processing payment…' : `Pay ${inr(f.balance)}`}</button></div>
              </Modal>
            )}
            {receipt && (
              <Modal title="Fee receipt" onClose={() => setReceipt(null)}>
                <div className="admit">
                  <div className="admit-h"><Logo size={34} /><div><b>Maharaja Surajmal Institute of Technology</b><small>Fee receipt</small></div></div>
                  <dl className="kv" style={{ marginTop: 14 }}>
                    <dt>Student</dt><dd>{f.student.name}, <span className="mono">{f.student.rollNo}</span></dd>
                    <dt>Amount</dt><dd className="mono">{inr(receipt.amount)}</dd>
                    <dt>Paid on</dt><dd>{fmtDateTime(receipt.createdAt)}</dd>
                    <dt>Paid by</dt><dd>{receipt.paidBy}</dd>
                    <dt>Method</dt><dd>{receipt.method}</dd>
                    <dt>Transaction ID</dt><dd className="mono">{receipt.txn}</dd>
                    <dt>For</dt><dd>Semester {f.student.semester} fee, 2026–27</dd>
                  </dl>
                </div>
                <div className="actions" style={{ marginTop: 12 }}><button className="btn" onClick={() => window.print()}>Print</button></div>
              </Modal>
            )}
          </>
        );
      }}
    </Async>
  );
}
