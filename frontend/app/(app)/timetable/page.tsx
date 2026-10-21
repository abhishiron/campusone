'use client';
import { useFetch, useStudentQuery } from '@/lib/hooks';
import { DAYS } from '@/lib/timetable';
import { usePage } from '@/components/Shell';
import { Async, Panel, Pill } from '@/components/ui';
import type { Timetable } from '@/lib/types';

export default function TimetablePage() {
  const { sep, ready } = useStudentQuery();
  const state = useFetch<Timetable>(ready ? sep('/timetable') : null);
  usePage('Timetable', state.data ? `${state.data.label}, lunch break 13:15 to 13:45` : undefined);
  const today = new Date().getDay();
  return (
    <Async state={state}>
      {(t) => {
        const hues = new Map(t.courses.map((c) => [c.code, c.hue]));
        return (
          <Panel title="This week" extra={today >= 1 && today <= 5 ? <Pill tone="acc">Today: {DAYS[today - 1]}</Pill> : undefined}>
            <div className="tbl-wrap">
              <table className="tt">
                <thead><tr><th />{t.periods.map((p) => <th key={p}>{p}</th>)}</tr></thead>
                <tbody>
                  {DAYS.map((d, i) => (
                    <tr key={d} className={i + 1 === today ? 'today' : ''}>
                      <th className="day" scope="row">{d}</th>
                      {t.periods.map((_, slot) => {
                        const s = t.slots.find((x) => x.day === i + 1 && x.slot === slot);
                        return <td key={slot}>{s ? <div className="slot" style={{ '--h': hues.get(s.code) } as React.CSSProperties}><b>{s.code}</b><small>{s.room}</small></div> : <div className="free" />}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="legend">{t.courses.map((c) => <span key={c.code} style={{ '--h': c.hue } as React.CSSProperties}><i />{c.code} {c.name}</span>)}</div>
          </Panel>
        );
      }}
    </Async>
  );
}
