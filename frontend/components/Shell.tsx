'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarCheck, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Megaphone, Menu, School, Users, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { roleLabel, timeAgo } from '@/lib/format';
import type { AppNotification, Role } from '@/lib/types';

const NAV: Record<Role, { href: string; label: string; icon: LucideIcon }[]> = {
  ADMIN: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/people', label: 'People', icon: Users },
    { href: '/classes', label: 'Classes & courses', icon: School },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
  TEACHER: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { href: '/assignments', label: 'Assignments', icon: ClipboardList },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
  STUDENT: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { href: '/assignments', label: 'Assignments', icon: ClipboardList },
    { href: '/grades', label: 'Grades', icon: GraduationCap },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
  PARENT: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { href: '/assignments', label: 'Assignments', icon: ClipboardList },
    { href: '/grades', label: 'Grades', icon: GraduationCap },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
};

const initials = (name: string) => name.split(' ').filter((p) => !/^(dr|prof|mr|mrs|ms)\.?$/i.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: AppNotification[]; unread: number }>({ items: [], unread: 0 });
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => api<{ items: AppNotification[]; unread: number }>('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    refresh();
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open, refresh]);

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) { await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {}); refresh(); }
    if (n.link) router.push(n.link);
  };
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); refresh(); };

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open}
        className="relative rounded border border-line bg-surface p-2 text-ink hover:border-ink/40">
        <Bell size={18} />
        {data.unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[11px] font-semibold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] rounded border border-line bg-surface shadow-[0_20px_60px_-20px_rgba(20,40,45,0.45)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-serif text-lg">Notifications</span>
            <button onClick={readAll} disabled={!data.unread} className="text-sm font-medium underline disabled:no-underline disabled:opacity-40">Mark all as read</button>
          </div>
          <ul className="max-h-[380px] overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-8 text-center text-muted">You are all caught up.</li>}
            {data.items.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className="flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left last:border-0 hover:bg-paper">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-bad'}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.read ? '' : 'font-semibold'}`}>{n.title}</span>
                    <span className="block truncate text-sm text-muted">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, students, activeStudent, setActiveStudentId, logout } = useAuth();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  if (!user) return null;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-7">
        <Link href="/dashboard" className="font-serif text-[26px] tracking-tight">CampusOne</Link>
      </div>
      <nav className="flex-1 px-3" aria-label="Main">
        <ul className="space-y-0.5">
          {NAV[user.role].map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded px-3 py-2.5 text-[15px] transition-colors ${active ? 'font-semibold text-ink' : 'text-muted hover:bg-black/[0.04] hover:text-ink'}`}>
                  <Icon size={18} />
                  <span className={active ? 'marker' : ''}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{initials(user.name)}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-muted">{roleLabel(user.role)}</p>
          </div>
        </div>
        <button onClick={logout} className="btn-quiet mt-3 w-full"><LogOut size={16} /> Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-paper lg:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-paper shadow-xl">
            <button aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute right-3 top-4 rounded p-1 text-muted"><X size={20} /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button className="rounded border border-line bg-surface p-2 lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></button>
            {user.role === 'PARENT' && activeStudent && (
              students.length > 1 ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Viewing</span>
                  <select className="field !w-auto !py-1.5" value={activeStudent.id} onChange={(e) => setActiveStudentId(e.target.value)} aria-label="Choose child">
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) : (
                <p className="truncate text-sm text-muted">Viewing <span className="font-semibold text-ink">{activeStudent.name}</span> · {activeStudent.classroom}</p>
              )
            )}
            {user.role === 'STUDENT' && activeStudent && <p className="truncate text-sm text-muted">{activeStudent.classroom} · Roll {activeStudent.rollNo}</p>}
          </div>
          <NotificationBell />
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
