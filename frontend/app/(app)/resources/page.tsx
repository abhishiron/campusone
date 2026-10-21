'use client';
import { useState } from 'react';
import { api, openFile, upload } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { ago, fmtSize } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, DropZone, Empty, Modal, Pill, useAction, useToast } from '@/components/ui';
import type { Course, Resource } from '@/lib/types';

function ShareModal({ courses, onClose, onDone }: { courses: Course[]; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!String(form.get('title')).trim() || !file) return setErr('Add a title and choose a file to share.');
    if (file.size > 25 * 1048576) return setErr('That file is over 25 MB. Compress it or split it into parts.');
    form.append('file', file);
    if (await run(() => upload('/resources', form), 'Shared with your batch')) onDone();
  };
  return (
    <Modal title="Share notes or a past paper" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Title</span><input name="title" required maxLength={90} placeholder="e.g. CN unit 2 notes: TCP and UDP" /></label>
        <div className="row2">
          <label className="field"><span>Subject</span><select name="courseId">{courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
          <label className="field"><span>Type</span><select name="type"><option value="NOTES">Notes</option><option value="PYQ">Past paper</option></select></label>
        </div>
        <DropZone label="Drag a file here or click to browse" chosen={file?.name} hint="PDF, DOCX, PPTX, ZIP or image, up to 25 MB" accept=".pdf,.docx,.pptx,.zip,.png,.jpg,.jpeg" onFiles={(f) => { setFile(f[0] ?? null); setErr(''); }} />
        <p className="err" role="alert">{err}</p>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : 'Share with batch'}</button></div>
      </form>
    </Modal>
  );
}

export default function ResourcesPage() {
  usePage('Notes and PYQs', 'Shared by your batch');
  const state = useFetch<Resource[]>('/resources');
  const courses = useFetch<Course[]>('/courses');
  const toast = useToast();
  const { run } = useAction();
  const [type, setType] = useState<'all' | 'NOTES' | 'PYQ'>('all');
  const [course, setCourse] = useState('');
  const [sharing, setSharing] = useState(false);
  const vote = (id: string) => run(() => api(`/resources/${id}/vote`, { method: 'POST' })).then(state.reload);

  return (
    <section className="card">
      <header className="card-h">
        <div className="tabs" role="tablist">
          {([['all', 'All'], ['NOTES', 'Notes'], ['PYQ', 'Past papers']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={type === k} className={`tab ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>
        <div className="tools">
          <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter by subject">
            <option value="">All subjects</option>
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.code}, {c.name}</option>)}
          </select>
          <button className="btn primary sm" onClick={() => setSharing(true)}><Icon name="upload" size={16} />Share a file</button>
        </div>
      </header>
      <div className="card-b">
        <Async state={state}>
          {(all) => {
            const list = all.filter((r) => (type === 'all' || r.type === type) && (!course || r.courseId === course));
            return list.length ? (
              <ul className="list">
                {list.map((r) => (
                  <li key={r.id}>
                    <button className={`vote ${r.voted ? 'on' : ''}`} onClick={() => vote(r.id)} aria-pressed={r.voted} aria-label={`Upvote ${r.title}`}><Icon name="up" size={14} />{r.votes}</button>
                    <div className="grow"><b>{r.title}</b><small>{r.code}, shared by {r.by}, {fmtSize(r.file.size)}, {ago(r.createdAt)}</small></div>
                    <Pill tone={r.type === 'PYQ' ? 'warn' : 'acc'} className="hide-s">{r.type === 'PYQ' ? 'Past paper' : 'Notes'}</Pill>
                    <button className="btn sm" onClick={() => openFile(r.file.id).catch((e) => toast(e.message, 'error'))}><Icon name="ext" size={15} />Open</button>
                  </li>
                ))}
              </ul>
            ) : <Empty>Nothing here yet. Share your notes to help your batch.</Empty>;
          }}
        </Async>
      </div>
      {sharing && <ShareModal courses={courses.data ?? []} onClose={() => setSharing(false)} onDone={() => { setSharing(false); state.reload(); }} />}
    </section>
  );
}
