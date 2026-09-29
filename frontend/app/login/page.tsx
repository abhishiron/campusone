'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Field, SubmitButton } from '@/components/ui';

const DEMOS = [
  { role: 'Admin', email: 'admin@campusone.test', note: 'Neha Kulkarni' },
  { role: 'Teacher', email: 'anita.rao@campusone.test', note: 'Dr. Anita Rao' },
  { role: 'Student', email: 'aarav.malhotra@campusone.test', note: 'Aarav Malhotra' },
  { role: 'Parent', email: 'kavita.nair@campusone.test', note: 'Kavita Nair, two children' },
];

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace('/dashboard'); }, [user, loading, router]);

  const signIn = async (e: string, p: string) => {
    setBusy(true); setError('');
    try { await login(e, p); router.replace('/dashboard'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not sign in.'); setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="font-serif text-4xl tracking-tight">CampusOne</p>
        <p className="mt-2 text-muted">Attendance, assignments, grades and announcements in one place.</p>

        <form className="mt-8 space-y-4 rounded border border-line bg-surface p-6" onSubmit={(e) => { e.preventDefault(); signIn(email, password); }}>
          <Field label="Email">
            <input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
          </Field>
          <Field label="Password">
            <input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <SubmitButton type="submit" busy={busy} className="btn-primary w-full">Sign in</SubmitButton>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-sm text-muted">Demo accounts (password: campus123)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMOS.map((d) => (
              <button key={d.role} disabled={busy} onClick={() => signIn(d.email, 'campus123')}
                className="rounded border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-ink/40 disabled:opacity-50">
                <span className="block text-sm font-semibold">{d.role}</span>
                <span className="block truncate text-xs text-muted">{d.note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
