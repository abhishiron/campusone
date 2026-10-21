/** Dates are stored as YYYY-MM-DD strings in the server's local time zone. */
const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
/** Whole days from today to `s` (negative when `s` is in the past). */
export const daysUntil = (s: string) => Math.round((parseISO(s).getTime() - parseISO(today()).getTime()) / 864e5);
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Teaching periods. A slot index points into this list; each period is an hour long. */
export const PERIODS = ['09:15', '10:15', '11:15', '12:15', '13:45', '14:45'];
export const plusHour = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${pad(h + 1)}:${pad(m)}`;
};
