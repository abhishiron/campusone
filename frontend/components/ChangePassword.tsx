'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/components/ui';

/** Shown instead of the app while the account still has a temporary password chosen by someone else. */
export function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const { busy, run } = useAction();
  const [mismatch, setMismatch] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const next = String(d.get('newPassword'));
    if (next !== String(d.get('confirm'))) { setMismatch(true); return; }
    setMismatch(false);
    await run(() => changePassword(String(d.get('currentPassword')), next), 'Password updated');
  };
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section className="card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
        <h2 style={{ marginBottom: 6 }}>Choose your own password</h2>
        <p className="hint" style={{ marginBottom: 16 }}>
          {user?.name}, you signed in with a temporary password. Set a new one to continue.
        </p>
        <form onSubmit={submit}>
          <label className="field"><span>Temporary password</span><input name="currentPassword" type="password" required autoComplete="current-password" /></label>
          <label className="field"><span>New password</span><input name="newPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
          <label className="field"><span>Repeat new password</span><input name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
          {mismatch && <p className="hint" role="alert" style={{ color: 'var(--bad)', marginBottom: 12 }}>The two new passwords don't match.</p>}
          <p className="hint" style={{ marginBottom: 14 }}>At least 8 characters.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={logout}>Sign out</button>
            <button className="btn primary" disabled={busy}>Save password</button>
          </div>
        </form>
      </section>
    </main>
  );
}
