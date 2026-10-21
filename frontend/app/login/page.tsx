'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { roleKey, useAuth } from '@/lib/auth';
import { API_URL, ApiError } from '@/lib/api';
import { Icon, Logo, type IconName } from '@/components/Icon';
import { ThemeButton } from '@/components/Shell';
import type { Role } from '@/lib/types';

const ROLES: Record<Role, { label: string; icon: IconName; blurb: string; idLabel: string; placeholder: string; id: string; pw: string }> = {
  STUDENT: { label: 'Student', icon: 'cap', blurb: 'Learn and submit', idLabel: 'Enrollment number or email', placeholder: 'e.g. 00315003123', id: '00315003123', pw: 'student123' },
  TEACHER: { label: 'Professor', icon: 'board', blurb: 'Teach and grade', idLabel: 'Faculty email', placeholder: 'name@msit.edu', id: 'neha.sharma@msit.edu', pw: 'prof123' },
  ADMIN: { label: 'Admin', icon: 'shield', blurb: 'Run the institute', idLabel: 'Admin email', placeholder: 'name@msit.edu', id: 'admin@msit.edu', pw: 'admin123' },
  PARENT: { label: 'Parent', icon: 'home', blurb: "Follow your child", idLabel: 'Parent email', placeholder: 'you@example.com', id: 'sunil.goel@parents.msit.edu', pw: 'parent123' },
};
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animated campus network behind the login copy. Follows the pointer and the selected role's colour. */
function Network({ role }: { role: Role }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const roleRef = useRef(role);
  const redraw = useRef<() => void>(() => {});
  useEffect(() => { roleRef.current = role; redraw.current(); }, [role]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const reduce = reduceMotion();
    let W = 0, H = 0, raf = 0, alive = true;
    let mouse: { x: number; y: number } | null = null;
    let nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const size = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(24, Math.min(84, Math.round((W * H) / 10000)));
      nodes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.5 + 1 }));
    };
    const draw = () => {
      if (!alive) return;
      const col = getComputedStyle(document.documentElement).getPropertyValue('--' + roleKey(roleRef.current)).trim() || '#8B7CF6';
      ctx.clearRect(0, 0, W, H);
      const D = 130;
      if (!reduce) for (const p of nodes) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      ctx.lineWidth = 1; ctx.strokeStyle = col; ctx.fillStyle = col;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < D) { ctx.globalAlpha = (1 - d / D) * 0.35; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        if (mouse) {
          const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
          if (d < 190) { ctx.globalAlpha = (1 - d / 190) * 0.85; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 0.9;
      for (const p of nodes) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      if (mouse) { ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 3.2, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    size(); draw();
    redraw.current = () => { if (reduce) draw(); };
    const art = c.parentElement!;
    const onR = () => { size(); if (reduce) draw(); };
    const onM = (e: PointerEvent) => { const r = c.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (reduce) draw(); };
    const onL = () => { mouse = null; if (reduce) draw(); };
    const onTheme = () => { if (reduce) draw(); };
    window.addEventListener('resize', onR); art.addEventListener('pointermove', onM); art.addEventListener('pointerleave', onL); window.addEventListener('campusone-theme', onTheme);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onR); art.removeEventListener('pointermove', onM); art.removeEventListener('pointerleave', onL); window.removeEventListener('campusone-theme', onTheme); };
  }, []);
  return <canvas id="net" ref={ref} aria-hidden="true" />;
}

/** Live status from the API's health endpoint, measured from this browser. */
function ServiceStatus() {
  const [s, setS] = useState<{ ok: boolean; apiMs?: number; dbMs?: number; uptime?: number } | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const t = performance.now();
      try {
        const r = await fetch(`${API_URL}/health`);
        const j = await r.json();
        if (!stop) setS({ ok: r.ok, apiMs: performance.now() - t, dbMs: j.dbMs, uptime: j.uptimeSec });
      } catch { if (!stop) setS({ ok: false }); }
    };
    check();
    const id = setInterval(check, 10000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  const up = (sec: number) => (sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} min` : `${Math.round(sec / 3600)} h`);
  return (
    <ul className="status" aria-label="Service status">
      <li><i className={`dot ${s && !s.ok ? 'off' : ''}`} />CampusOne API<span>{!s ? 'Checking…' : s.ok ? `${Math.round(s.apiMs!)} ms` : 'Offline'}</span></li>
      <li><i className={`dot ${s && !s.ok ? 'off' : ''}`} />Database<span>{s?.ok ? `${s.dbMs!.toFixed(1)} ms` : '—'}</span></li>
      <li><i className={`dot ${s && !s.ok ? 'off' : ''}`} />Up for<span>{s?.ok ? up(s.uptime!) : '—'}</span></li>
    </ul>
  );
}

function Boot({ role, onDone }: { role: Role; onDone: () => void }) {
  const lines = ['Credentials verified', `Session token issued, role: ${ROLES[role].label.toLowerCase()}`, 'Loading your records', 'Opening your dashboard'];
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduceMotion()) { onDone(); return; }
    const t = setInterval(() => setN((x) => x + 1), 260);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (n > lines.length) { const t = setTimeout(onDone, 180); return () => clearTimeout(t); } }, [n, lines.length, onDone]);
  return (
    <div className="boot" role="status">
      <div className="boot-box">
        <Logo size={40} />
        <ol>{lines.map((l, i) => <li key={l} className={i < n ? 'on' : ''}>{l}</li>)}</ol>
        <div className="bar"><i style={{ width: `${(Math.min(n, lines.length) / lines.length) * 100}%` }} /></div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>('STUDENT');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState<Role | null>(null);
  const R = ROLES[role];

  useEffect(() => { document.title = 'Sign in | CampusOne'; }, []);
  useEffect(() => { if (!loading && user && !booting) router.replace('/overview'); }, [user, loading, booting, router]);
  useEffect(() => { document.body.dataset.role = roleKey(booting ?? role); }, [role, booting]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pw) { setError(`Enter your ${R.idLabel.toLowerCase()} and password.`); return; }
    setBusy(true); setError('');
    try {
      const u = await login(id.trim(), pw);
      setBooting(u.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="art">
        <Network role={booting ?? role} />
        <div className="art-inner">
          <div className="brand"><Logo /><span>CampusOne</span></div>
          <div className="art-copy">
            <h1>One campus. One sign-in.</h1>
            <p>Attendance, assignments, grades and campus services for Maharaja Surajmal Institute of Technology, in one place for every role.</p>
          </div>
          <ServiceStatus />
        </div>
      </section>
      <section className="panel-login">
        <ThemeButton />
        <div className="login-box">
          <h2>Sign in to CampusOne</h2>
          <p className="muted">Choose your role to continue.</p>
          <div className="roles" role="radiogroup" aria-label="Role">
            {(Object.keys(ROLES) as Role[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={k === role} className={`role-opt ${k === role ? 'on' : ''}`}
                style={{ '--c': `var(--${roleKey(k)})` } as React.CSSProperties} onClick={() => { setRole(k); setError(''); }}>
                <Icon name={ROLES[k].icon} size={22} /><span><b>{ROLES[k].label}</b><small>{ROLES[k].blurb}</small></span>
              </button>
            ))}
          </div>
          <form onSubmit={submit} noValidate>
            <label className="field"><span>{R.idLabel}</span><input autoComplete="username" placeholder={R.placeholder} value={id} onChange={(e) => setId(e.target.value)} /></label>
            <label className="field"><span>Password</span>
              <div className="pw">
                <input type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={pw} onChange={(e) => setPw(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            <p className="err" role="alert">{error}</p>
            <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Signing in…' : `Sign in as ${R.label.toLowerCase()}`}</button>
          </form>
          <div className="demo">
            <div><small>Demo {R.label.toLowerCase()} account</small><code>{R.id}</code><code>{R.pw}</code></div>
            <button className="btn sm" type="button" onClick={() => { setId(R.id); setPw(R.pw); setError(''); }}>Fill in</button>
          </div>
        </div>
      </section>
      {booting && <Boot role={booting} onDone={() => router.replace('/overview')} />}
    </div>
  );
}
