'use client';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { ago } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, IconBtn, Panel, Pill, useAction } from '@/components/ui';
import type { Announcement, Course } from '@/lib/types';

const AUD: Record<string, string> = { ALL: 'Everyone', STUDENT: 'Students', TEACHER: 'Faculty', PARENT: 'Parents' };

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const staff = user!.role === 'ADMIN' || user!.role === 'TEACHER';
  usePage('Announcements', staff ? 'Post updates to students and staff' : 'Notices from the institute and your faculty');
  const state = useFetch<Announcement[]>('/announcements');
  const courses = useFetch<Course[]>(user!.role === 'TEACHER' ? '/courses' : null);
  const { busy, run } = useAction();

  const remove = (a: Announcement) => run(() => api(`/announcements/${a.id}`, { method: 'DELETE' }), 'Announcement deleted').then(state.reload);
  const post = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.currentTarget, d = new FormData(el);
    const ok = await run(() => api('/announcements', { method: 'POST', body: { title: String(d.get('title')).trim(), body: String(d.get('body')).trim(), audience: d.get('audience') } }), 'Announcement posted');
    if (ok) { el.reset(); state.reload(); }
  };

  const feed = (
    <Async state={state}>
      {(list) => list.length ? (
        <ul className="anns">
          {list.map((a) => (
            <li key={a.id} className="ann">
              <Avatar name={a.by} lg />
              <div className="ann-b">
                <div className="ann-h"><h3>{a.title}</h3><Pill tone="acc">{AUD[a.audience] ?? a.audience}</Pill></div>
                <p>{a.body}</p>
                <small>{a.by}, {ago(a.createdAt)}</small>
              </div>
              {a.canDelete && <IconBtn icon="x" label="Delete announcement" onClick={() => remove(a)} disabled={busy} />}
            </li>
          ))}
        </ul>
      ) : <Empty>No announcements yet.{staff ? ' Post the first one to reach your audience.' : ''}</Empty>}
    </Async>
  );
  if (!staff) return <Panel title="All notices">{feed}</Panel>;

  const audiences = user!.role === 'ADMIN'
    ? [['ALL', 'Everyone'], ['STUDENT', 'All students'], ['TEACHER', 'All faculty'], ['PARENT', 'All parents']]
    : (courses.data ?? []).map((c) => [c.id, `Students of ${c.code}, ${c.name}`]);
  return (
    <div className="grid-2" style={{ marginTop: 0 }}>
      <Panel title="Recent">{feed}</Panel>
      <Panel title="New announcement">
        <form onSubmit={post}>
          <label className="field"><span>Title</span><input name="title" required minLength={3} maxLength={90} placeholder="e.g. Lab moved to Lab 4" /></label>
          <label className="field"><span>Message</span><textarea name="body" rows={5} required minLength={3} placeholder="What should people know?" /></label>
          <label className="field"><span>Send to</span><select name="audience">{audiences.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <p className="hint" style={{ marginBottom: 12 }}>Everyone in the audience also gets a notification.</p>
          <div className="actions"><button className="btn primary" disabled={busy}><Icon name="speaker" size={16} />Post announcement</button></div>
        </form>
      </Panel>
    </div>
  );
}
