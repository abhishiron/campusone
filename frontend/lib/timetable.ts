import type { Timetable } from './types';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const plusHour = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Classes on a given weekday (1 = Monday), merging back-to-back periods of the same course and room into one block. */
export function classesOn(tt: Timetable, weekday: number) {
  const out: { code: string; courseId: string; room: string; start: number; end: number; time: string }[] = [];
  for (const s of tt.slots.filter((x) => x.day === weekday).sort((a, b) => a.slot - b.slot)) {
    const last = out[out.length - 1];
    if (last && last.code === s.code && last.room === s.room && last.end === s.slot - 1) last.end = s.slot;
    else out.push({ code: s.code, courseId: s.courseId, room: s.room, start: s.slot, end: s.slot, time: '' });
  }
  return out.map((b) => ({ ...b, time: `${tt.periods[b.start]}–${plusHour(tt.periods[b.end])}` }));
}
