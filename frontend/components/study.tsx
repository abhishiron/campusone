import { hm, isoOf } from '@/lib/format';
import type { StudySession } from '@/lib/types';

export function sessionStatus(s: Pick<StudySession, 'start' | 'durationMin'>) {
  const now = Date.now(), start = new Date(s.start).getTime(), end = start + s.durationMin * 6e4;
  if (now >= end) return { k: 'ended' as const, text: 'Ended' };
  if (now >= start) return { k: 'live' as const, text: `Live now, ${Math.max(1, Math.round((end - now) / 6e4))} min left` };
  const m = Math.round((start - now) / 6e4);
  if (m < 60) return { k: 'soon' as const, text: `Starts in ${m} min` };
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = Math.round((day.getTime() - today.getTime()) / 864e5);
  const text = dd === 0 ? `Today, ${hm(start)}` : dd === 1 ? `Tomorrow, ${hm(start)}`
    : `${new Date(start).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${hm(start)}`;
  return { k: 'later' as const, text };
}

/** Prefilled "add to Google Calendar" link. */
export function gcalLink(s: StudySession) {
  const f = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(s.start).getTime();
  const details = (s.description ? s.description + '\n\n' : '') + 'Join on Google Meet: ' + s.link;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Group study: ' + s.title)}&dates=${f(start)}/${f(start + s.durationMin * 6e4)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(s.link)}`;
}

export const todayISO = () => isoOf(new Date());
