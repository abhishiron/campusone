const pad = (n: number) => String(n).padStart(2, '0');

export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
/** Accepts YYYY-MM-DD strings (local dates) or timestamps. */
const toDate = (d: string | Date) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? parseISO(d) : new Date(d));
/** Whole days from today; negative in the past. */
export const daysLeft = (d: string | Date) => {
  const a = toDate(d); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 864e5);
};

export const fmtDate = (d: string | Date) => toDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtLong = (d: string | Date) => toDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const examDay = (d: string) => parseISO(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const hm = (d: string | Date | number) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDateTime = (d: string | Date) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const dRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`);

export function ago(d: string | Date) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "Due today", "Due tomorrow", "Due in 3 days". */
export function dueText(d: string | Date) {
  const n = daysLeft(d);
  return n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due in ${n} days`;
}

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w === 'class' ? 'es' : 's'}`;

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

export const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export const initials = (n: string) =>
  n.replace(/^(Dr\.|Prof\.|Ms\.|Mr\.)\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
