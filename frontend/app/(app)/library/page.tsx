'use client';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Async, Empty, Panel, Pill, Stat, useAction } from '@/components/ui';
import type { Book, LibraryPayload } from '@/lib/types';

export default function LibraryPage() {
  const { user } = useAuth();
  usePage('Library', 'Central library, open 9:00 to 17:30, Saturdays till 13:00');
  const { sep, ready } = useStudentQuery();
  const state = useFetch<LibraryPayload>(ready ? sep('/library') : null);
  const { busy, run } = useAction();
  const renew = (b: Book) => run(() => api<Book>(`/library/${b.id}/renew`, { method: 'POST' }), (r) => `Renewed. New due date is ${fmtDate(r.dueOn)}.`).then(state.reload);
  return (
    <Async state={state}>
      {(d) => {
        const next = d.books[0];
        return (
          <>
            <div className="stats">
              <Stat label="Books issued" value={`${d.books.length} of ${d.limit}`} note={d.limit - d.books.length ? `${d.limit - d.books.length} more can be borrowed` : 'Limit reached'} />
              <Stat label="Next return" value={next ? fmtDate(next.dueOn) : 'None'} note={next?.title} />
              <Stat label="Fine to pay" value={inr(d.fine)} note={d.fine ? `₹${d.finePerDay} per day for each overdue book` : 'No fines'} tone={d.fine ? 'warn' : undefined} />
            </div>
            <div className="mt">
              <Panel title="Issued books" flush extra={<span className="hint">Renewing adds {d.renewDays} days, up to {d.maxRenewals} times</span>}>
                {d.books.length ? (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Status</th><th>Renewals</th>{user!.role === 'STUDENT' && <th className="r"><span className="sr">Actions</span></th>}</tr></thead>
                      <tbody>
                        {d.books.map((b) => (
                          <tr key={b.id}>
                            <td><b>{b.title}</b><div className="hint">{b.author}</div></td>
                            <td>{fmtDate(b.issuedOn)}</td><td>{fmtDate(b.dueOn)}</td>
                            <td>{b.daysLeft < 0
                              ? <Pill tone="bad">Overdue {-b.daysLeft} {b.daysLeft === -1 ? 'day' : 'days'}, fine {inr(b.fine)}</Pill>
                              : <Pill tone={b.daysLeft <= 3 ? 'warn' : 'ok'}>{b.daysLeft === 0 ? 'Due today' : b.daysLeft === 1 ? 'Due tomorrow' : `Due in ${b.daysLeft} days`}</Pill>}</td>
                            <td className="mono">{b.renewals} of {d.maxRenewals}</td>
                            {user!.role === 'STUDENT' && <td className="r"><button className="btn sm" disabled={busy} onClick={() => renew(b)}>Renew</button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty>No books issued. Borrow from the library counter with your ID card.</Empty>}
              </Panel>
            </div>
          </>
        );
      }}
    </Async>
  );
}
