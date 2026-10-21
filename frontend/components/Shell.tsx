'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon, Logo, type IconName } from './Icon';
import { Avatar, LEVEL_TEXT, Modal, levelTone } from './ui';
import { roleKey, useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import type { AppNotification, AttendanceSummary, Role } from '@/lib/types';
import { attNote } from './attendance';

type NavItem = [href: string, label: string, icon: IconName] | [group: '#', label: string];
const NAV: Record<Role, NavItem[]> = {
  ADMIN: [['/overview', 'Overview', 'grid'], ['/users', 'Users', 'users'], ['/courses', 'Courses', 'book'], ['/announcements', 'Announcements', 'speaker']],
  TEACHER: [
    ['/overview', 'Overview', 'grid'], ['/attendance', 'Attendance', 'calcheck'], ['/assignments', 'Assignments', 'file'], ['/grades', 'Grades', 'chart'],
    ['/timetable', 'Timetable', 'cal'], ['/leaves', 'Leave requests', 'leave'], ['/announcements', 'Announcements', 'speaker'],
  ],
  STUDENT: [
    ['/overview', 'Overview', 'grid'],
    ['#', 'Academics'], ['/checkin', 'Check in', 'pin'], ['/attendance', 'Attendance', 'calcheck'], ['/assignments', 'Assignments', 'file'], ['/grades', 'Grades', 'chart'], ['/timetable', 'Timetable', 'cal'], ['/exams', 'Exams', 'exam'],
    ['#', 'Together'], ['/study', 'Study rooms', 'video'], ['/resources', 'Notes and PYQs', 'notes'], ['/announcements', 'Announcements', 'speaker'],
    ['#', 'Campus'], ['/library', 'Library', 'lib'], ['/fees', 'Fees', 'rupee'], ['/leaves', 'Leave and certificates', 'leave'], ['/placements', 'Placements', 'brief'],
  ],
  PARENT: [
    ['/overview', 'Overview', 'grid'], ['/attendance', 'Attendance', 'calcheck'], ['/assignments', 'Assignments', 'file'], ['/grades', 'Grades', 'chart'],
    ['/timetable', 'Timetable', 'cal'], ['/exams', 'Exams', 'exam'], ['/fees', 'Fees', 'rupee'], ['/library', 'Library', 'lib'], ['/leaves', 'Leave requests', 'leave'], ['/announcements', 'Announcements', 'speaker'],
  ],
};
const ROLE_META: Record<Role, { label: string; icon: IconName }> = {
  ADMIN: { label: 'Admin', icon: 'shield' }, TEACHER: { label: 'Professor', icon: 'board' }, STUDENT: { label: 'Student', icon: 'cap' }, PARENT: { label: 'Parent', icon: 'home' },
};

/* ---------- page title ---------- */
const PageCtx = createContext<(t: { title: string; sub?: string }) => void>(() => {});
/** Sets the heading shown in the top bar and the document title. */
export function usePage(title: string, sub?: string) {
  const set = useContext(PageCtx);
  useEffect(() => {
    set({ title, sub });
    document.title = `${title} | CampusOne`;
  }, [set, title, sub]);
}

/* ---------- theme ---------- */
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};
export function ThemeButton() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(isDark()), []);
  const flip = () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('campusone-theme', next); } catch { /* private mode */ }
    setDark(next === 'dark');
    window.dispatchEvent(new Event('campusone-theme'));
  };
  return <button className="icon-btn" onClick={flip} aria-label="Switch light or dark theme" title="Switch theme"><Icon name={dark ? 'sun' : 'moon'} /></button>;
}

/* ---------- notifications ---------- */
export const DESKTOP_KEY = 'campusone_desktop';
function Notifications() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: AppNotification[]; unread: number }>({ items: [], unread: 0 });
  const seen = useRef<Set<string> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const d = await api<{ items: AppNotification[]; unread: number }>('/notifications').catch(() => null);
    if (!d) return;
    // Mirror new attendance warnings as desktop notifications when the student turned them on.
    if (seen.current && localStorage.getItem(DESKTOP_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted') {
      for (const n of d.items) if (!seen.current.has(n.id) && !n.read && n.kind === 'WARN') new Notification(n.title, { body: n.body });
    }
    seen.current = new Set(d.items.map((n) => n.id));
    setData(d);
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    window.addEventListener('campusone-refresh', onFocus);
    return () => { clearInterval(t); window.removeEventListener('campusone-refresh', onFocus); };
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    refresh();
    if (n.link) router.push(n.link);
  };
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }).catch(() => {}); refresh(); };

  return (
    <div className="pop-wrap" ref={box}>
      <button className="icon-btn" onClick={() => { setOpen((o) => !o); if (!open) refresh(); }} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open}>
        <Icon name="bell" />{data.unread > 0 && <i className="ping" />}
      </button>
      {open && (
        <div className="pop">
          <header className="card-h">
            <h2>Notifications</h2>
            {data.unread > 0 && <button className="btn sm ghost" onClick={readAll}>Mark all as read</button>}
          </header>
          <ul className="notifs">
            {data.items.length === 0 && <li className="empty">You are all caught up.</li>}
            {data.items.slice(0, 12).map((n) => (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <button onClick={() => openItem(n)}>
                  <span className={`tick ${n.kind === 'WARN' ? 'w' : ''} ${n.read ? 'read' : ''}`} />
                  <div><p><b>{n.title}</b></p><p>{n.body}</p><small>{ago(n.createdAt)}</small></div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- attendance warning shown once per sign-in to students ---------- */
function AttendanceWarning() {
  const router = useRouter();
  const [risk, setRisk] = useState<AttendanceSummary['courses'] | null>(null);
  useEffect(() => {
    if (sessionStorage.getItem('campusone_warned')) return;
    sessionStorage.setItem('campusone_warned', '1');
    api<AttendanceSummary>('/attendance/summary').then((s) => {
      const r = s.courses.filter((c) => c.level !== 'OK').sort((a, b) => (a.level === 'DANGER' ? -1 : 1) - (b.level === 'DANGER' ? -1 : 1));
      if (r.length) setRisk(r);
    }).catch(() => {});
  }, []);
  if (!risk) return null;
  const danger = risk.filter((x) => x.level === 'DANGER').length, warn = risk.length - danger;
  return (
    <Modal title="Attendance warning" onClose={() => setRisk(null)}>
      <p style={{ marginBottom: 6 }}>
        {danger ? `You're below the 75% minimum in ${danger} ${danger === 1 ? 'subject' : 'subjects'}` : 'You have subjects close to the 75% minimum'}
        {danger && warn ? ` and close to it in ${warn} more` : ''}. Students under 75% may not be allowed to sit the exams.
      </p>
      <ul className="list">
        {risk.map((x) => (
          <li key={x.code}>
            <span className={`ico ${x.level === 'DANGER' ? 'danger' : 'warn'}`}><Icon name="alert" size={16} /></span>
            <div className="grow"><b>{x.name}: {x.pct?.toFixed(1)}%</b><small>{attNote(x)}</small></div>
            <span className={`pill ${levelTone(x.level)} hide-s`}>{LEVEL_TEXT[x.level]}</span>
          </li>
        ))}
      </ul>
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => setRisk(null)}>Remind me later</button>
        <button className="btn primary" onClick={() => { setRisk(null); router.push('/attendance'); }}>Open attendance tracker</button>
      </div>
    </Modal>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, students, activeStudent, setActiveStudentId, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [page, setPage] = useState<{ title: string; sub?: string }>({ title: '' });
  const [side, setSide] = useState(false);
  useEffect(() => setSide(false), [pathname]);
  useEffect(() => {
    if (user) document.body.dataset.role = roleKey(user.role);
  }, [user]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.key === 'ArrowLeft' ? router.back() : router.forward(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);
  if (!user) return null;
  const meta = ROLE_META[user.role];

  return (
    <PageCtx.Provider value={setPage}>
      <div className="app">
        <aside className={`side ${side ? 'open' : ''}`} aria-label="Main navigation">
          <div className="brand"><Logo /><span>CampusOne</span></div>
          <div className="role-tag"><Icon name={meta.icon} size={16} />{meta.label} workspace</div>
          <nav>
            {NAV[user.role].map((item) => item[0] === '#'
              ? <div key={item[1]} className="nav-g">{item[1]}</div>
              : (
                <Link key={item[0]} href={item[0]} className={`nav ${pathname === item[0] ? 'on' : ''}`} aria-current={pathname === item[0] ? 'page' : undefined}>
                  <Icon name={item[2] as IconName} /><span>{item[1]}</span>
                </Link>
              ))}
          </nav>
          <div className="me">
            <Avatar name={user.name} />
            <div><b>{user.name}</b><small>{user.title}</small></div>
            <button className="icon-btn sm" onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
          </div>
        </aside>
        <div className={`scrim ${side ? 'show' : ''}`} onClick={() => setSide(false)} />
        <div className="main">
          <header className="top">
            <button className="icon-btn only-m" onClick={() => setSide(true)} aria-label="Open menu"><Icon name="menu" /></button>
            <div className="hist">
              <button className="icon-btn" onClick={() => router.back()} aria-label="Back" title="Back (Alt + Left)"><Icon name="left" /></button>
              <button className="icon-btn" onClick={() => router.forward()} aria-label="Forward" title="Forward (Alt + Right)"><Icon name="right" /></button>
            </div>
            <div className="crumb"><h1>{page.title}</h1>{page.sub && <p>{page.sub}</p>}</div>
            <div className="top-actions">
              {user.role === 'PARENT' && students.length > 1 && activeStudent && (
                <select value={activeStudent.id} onChange={(e) => setActiveStudentId(e.target.value)} aria-label="Choose child">
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <ThemeButton />
              <Notifications />
            </div>
          </header>
          <main className="content"><div className="wrap">{children}</div></main>
        </div>
      </div>
      {user.role === 'STUDENT' && <AttendanceWarning />}
    </PageCtx.Provider>
  );
}
