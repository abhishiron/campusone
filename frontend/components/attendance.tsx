'use client';
import Link from 'next/link';
import { Icon } from './Icon';
import { plural } from '@/lib/format';
import type { TrackerCourse } from '@/lib/types';

/** One-line advice for a subject, based on the tracker numbers from the server. */
export function attNote(x: Pick<TrackerCourse, 'level' | 'need' | 'miss' | 'minRest' | 'rem'>) {
  if (x.level === 'DANGER') {
    if (x.minRest > x.rem) return `Even attending all ${x.rem} remaining classes won't reach 75% by semester end. Apply for medical or duty leave with proof, or meet your HOD.`;
    return `Attend the next ${plural(x.need, 'class')} in a row to get back to 75%.`;
  }
  if (x.level === 'WARN') return x.miss === 0 ? "You can't miss any more classes without dropping below 75%." : `Only ${plural(x.miss, 'class')} can be missed before you drop below 75%.`;
  return `You can miss ${plural(x.miss, 'class')} and stay at or above 75%.`;
}

export function Spark({ hist, cur }: { hist: number[]; cur: number }) {
  const v = [...hist, cur];
  if (v.length < 2) return null;
  const W = 120, H = 34, lo = 60, hi = 100;
  const x = (i: number) => 2 + (i * (W - 4)) / (v.length - 1);
  const y = (p: number) => H - 2 - ((Math.max(lo, Math.min(hi, p)) - lo) / (hi - lo)) * (H - 4);
  const down = cur < v[0];
  return (
    <svg className={`spark ${down ? 'down' : ''}`} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend over the last ${v.length} weeks: ${Math.round(v[0])}% to ${Math.round(cur)}%`}>
      <line x1={0} x2={W} y1={y(75)} y2={y(75)} className="s75" />
      <polyline points={v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')} />
      <circle cx={x(v.length - 1)} cy={y(cur)} r={2.8} />
    </svg>
  );
}

export function RiskBanner({ courses, showLink = true }: { courses: TrackerCourse[]; showLink?: boolean }) {
  const danger = courses.filter((x) => x.level === 'DANGER'), warn = courses.filter((x) => x.level === 'WARN');
  if (!danger.length && !warn.length) return null;
  const parts: React.ReactNode[] = [];
  if (danger.length) parts.push(<span key="d"><b>{danger.map((x) => x.code).join(', ')}</b> {danger.length === 1 ? 'is' : 'are'} below 75%</span>);
  if (warn.length) parts.push(<span key="w">{danger.length ? ' and ' : ''}<b>{warn.map((x) => x.code).join(', ')}</b> {warn.length === 1 ? 'is' : 'are'} close to the limit</span>);
  return (
    <div className="banner warn-b">
      <Icon name="alert" size={18} />
      <span>{parts}. Students below 75% may be stopped from sitting exams.</span>
      {showLink && <Link className="btn sm" href="/attendance">Open tracker</Link>}
    </div>
  );
}

/** Weekly attendance line with the 75% requirement dashed. */
export function LineChart({ points }: { points: { label: string; pct: number | null }[] }) {
  const v = points.filter((p): p is { label: string; pct: number } => p.pct !== null);
  if (v.length < 2) return <p className="hint">Not enough attendance recorded yet to draw a trend.</p>;
  const W = 560, H = 200, p = 34;
  const min = Math.min(70, Math.floor(Math.min(...v.map((x) => x.pct)) / 5) * 5), max = Math.max(90, Math.ceil(Math.max(...v.map((x) => x.pct)) / 5) * 5);
  const x = (i: number) => p + (i * (W - 2 * p)) / (v.length - 1);
  const y = (val: number) => H - p - ((val - min) / (max - min)) * (H - 2 * p - 6);
  const pts = v.map((d, i) => `${x(i).toFixed(1)},${y(d.pct).toFixed(1)}`).join(' ');
  const grid: number[] = [];
  for (let g = min; g <= max; g += 5) grid.push(g);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Weekly attendance ranged from ${Math.round(Math.min(...v.map((d) => d.pct)))} to ${Math.round(Math.max(...v.map((d) => d.pct)))} percent`}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={p} x2={W - p} y1={y(g)} y2={y(g)} className={`gl ${g === 75 ? 'th' : ''}`} />
            <text x={p - 8} y={y(g) + 4} textAnchor="end">{g}%</text>
          </g>
        ))}
        <polygon points={`${x(0)},${H - p} ${pts} ${x(v.length - 1)},${H - p}`} className="area" />
        <polyline points={pts} className="ln" />
        {v.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.pct)} r={4} className="pt"><title>Week of {d.label}: {d.pct.toFixed(1)}%</title></circle>
            <text x={x(i)} y={H - 8} textAnchor="middle">{d.label}</text>
          </g>
        ))}
      </svg>
      <p className="hint">Each point is one week. The dashed line marks the 75% attendance requirement.</p>
    </>
  );
}
