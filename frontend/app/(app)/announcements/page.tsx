'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Badge, ConfirmModal, Empty, ErrorNote, Field, Modal, PageHeader, Panel, Spinner, SubmitButton, useToast } from '@/components/ui';
import type { Announcement } from '@/lib/types';

const AUDIENCES = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'STUDENT', label: 'Students' },
  { value: 'PARENT', label: 'Parents' },
  { value: 'TEACHER', label: 'Teachers' },
];
const audienceLabel = (v: string) => AUDIENCES.find((a) => a.value === v)?.label ?? v;

function NewAnnouncement({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/announcements', { method: 'POST', body: { title, body, audience } });
      toast(`Announcement posted to ${audienceLabel(audience).toLowerCase()}.`);
      onCreated(); onClose();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not post the announcement.'); setBusy(false); }
  };

  return (
    <Modal title="New announcement" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Title"><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} /></Field>
        <Field label="Message"><textarea className="field min-h-[130px]" value={body} onChange={(e) => setBody(e.target.value)} required minLength={3} /></Field>
        <Field label="Who should see this?">
          <select className="field" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-quiet" onClick={onClose}>Cancel</button>
          <SubmitButton type="submit" busy={busy}>Post announcement</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Announcement[]>('/announcements');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);
  const canPost = user?.role === 'ADMIN' || user?.role === 'TEACHER';

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api(`/announcements/${deleting.id}`, { method: 'DELETE' }); toast('Announcement deleted.'); setDeleting(null); reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not delete.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Announcements" subtitle="News from the school, in one place."
        action={canPost ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New announcement</button> : undefined} />
      {loading ? <Spinner /> : error ? <ErrorNote message={error} onRetry={reload} /> : !data?.length ? (
        <Panel><Empty title="No announcements yet" hint={canPost ? 'Post the first one for your students and parents.' : 'New announcements will appear here.'} /></Panel>
      ) : (
        <div className="space-y-4">
          {data.map((a) => (
            <article key={a.id} className="rounded border border-line bg-surface px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl">{a.title}</h2>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="mark">{audienceLabel(a.audience)}</Badge>
                  {a.canDelete && <button aria-label={`Delete ${a.title}`} className="rounded p-1.5 text-muted hover:bg-bad/10 hover:text-bad" onClick={() => setDeleting(a)}><Trash2 size={16} /></button>}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{a.body}</p>
              <p className="mt-3 text-xs text-muted">{a.author} · {fmtDate(a.createdAt)}</p>
            </article>
          ))}
        </div>
      )}
      {creating && <NewAnnouncement onClose={() => setCreating(false)} onCreated={reload} />}
      {deleting && <ConfirmModal title="Delete announcement" message={`“${deleting.title}” will be removed for everyone.`} confirmLabel="Delete" busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />}
    </>
  );
}
