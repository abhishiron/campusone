'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useFetch, useTick } from '@/lib/hooks';
import { hm } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, IconBtn, Modal, useAction, useToast } from '@/components/ui';
import { gcalLink, sessionStatus, todayISO } from '@/components/study';
import type { Course, StudySession } from '@/lib/types';

interface Payload { me: string; batch: string; sessions: StudySession[] }
const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

function SessionCard({ s, onChange }: { s: StudySession; onChange: () => void }) {
  const toast = useToast();
  const { busy, run } = useAction();
  const st = sessionStatus(s);
  const end = new Date(s.start).getTime() + s.durationMin * 6e4;
  const full = s.going.length >= s.capacity && !s.imGoing;
  const rsvp = () => run(() => api<{ going: boolean }>(`/study/${s.id}/rsvp`, { method: 'POST' }), (r) => (r.going ? "You're going. Add it to your calendar so you don't miss it." : 'Removed you from the session')).then(onChange);
  const cancel = () => run(() => api(`/study/${s.id}`, { method: 'DELETE' }), 'Session cancelled. Classmates who were going have been notified.').then(onChange);
  const copy = () => navigator.clipboard.writeText(s.link).then(() => toast('Meet link copied'), () => toast(s.link));
  return (
    <article className={`sess ${st.k === 'live' ? 'live' : ''}`}>
      <div className="sess-top">
        {st.k === 'live' ? <span className="pill ok"><i className="pdot" />{st.text}</span> : <span className={`pill ${st.k === 'soon' ? 'warn' : ''}`}>{st.text}</span>}
        <span className="pill acc">{s.course?.code ?? 'General'}</span>
      </div>
      <h3>{s.title}</h3>
      {s.description && <p>{s.description}</p>}
      <div className="sess-meta">
        <span><Icon name="clock" size={14} />{hm(s.start)}–{hm(end)}, {s.durationMin} min</span>
        <span><Icon name="video" size={14} />Hosted by {s.isHost ? 'you' : s.host}</span>
      </div>
      <div className="sess-going">
        <div className="stack">{s.going.slice(0, 5).map((n) => <Avatar key={n} name={n} />)}</div>
        <span className="hint">{s.going.length} of {s.capacity} going{s.imGoing && !s.isHost ? ', including you' : ''}</span>
      </div>
      <div className="sess-act">
        <a className={`btn sm ${st.k === 'live' || st.k === 'soon' ? 'primary' : ''}`} href={s.link} target="_blank" rel="noopener noreferrer"><Icon name="video" size={16} />Join on Meet</a>
        {!s.isHost && <button className="btn sm" onClick={rsvp} disabled={busy || full}>{s.imGoing ? 'Not going' : full ? 'Session full' : "I'm going"}</button>}
        <span className="grow-sp" />
        <IconBtn icon="copy" label="Copy Meet link" onClick={copy} />
        <a className="icon-btn sm" href={gcalLink(s)} target="_blank" rel="noopener noreferrer" aria-label="Add to Google Calendar" title="Add to Google Calendar"><Icon name="calplus" size={16} /></a>
        {s.isHost && <IconBtn icon="x" label="Cancel session" onClick={cancel} disabled={busy} />}
      </div>
    </article>
  );
}

function HostModal({ courses, onClose, onDone }: { courses: Course[]; onClose: () => void; onDone: () => void }) {
  const { busy, run } = useAction();
  const [err, setErr] = useState('');
  const nh = `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const title = String(d.get('title')).trim();
    let link = String(d.get('link')).trim().toLowerCase().split('?')[0].replace(/\/+$/, '');
    if (link && !/^https?:\/\//.test(link)) link = 'https://' + link;
    link = link.replace(/^http:/, 'https:');
    if (!title) return setErr('Add a topic so classmates know what the session is about.');
    if (!MEET_RE.test(link)) return setErr('Paste a Google Meet link like https://meet.google.com/abc-defg-hij.');
    const [y, mo, da] = String(d.get('date')).split('-').map(Number);
    const [h, mi] = String(d.get('time')).split(':').map(Number);
    const start = new Date(y, mo - 1, da, h, mi);
    if (isNaN(start.getTime()) || start.getTime() < Date.now() - 5 * 6e4) return setErr('Pick a start time that is still ahead.');
    setErr('');
    const ok = await run(() => api('/study', {
      method: 'POST',
      body: { title, description: String(d.get('desc')).trim(), course: d.get('course'), start: start.toISOString(), durationMin: Number(d.get('dur')), capacity: Math.max(2, Math.min(100, Number(d.get('cap')) || 10)), link },
    }), 'Session scheduled. Your batch can see it now.');
    if (ok) onDone();
  };
  return (
    <Modal title="Host a study session" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Topic</span><input name="title" required maxLength={80} placeholder="e.g. Revising SQL joins before the DBMS mid-sem" /></label>
        <label className="field"><span>Subject</span><select name="course">{courses.map((c) => <option key={c.id} value={c.id}>{c.code}, {c.name}</option>)}<option value="GEN">General or other</option></select></label>
        <div className="row2">
          <label className="field"><span>Date</span><input type="date" name="date" required min={todayISO()} defaultValue={todayISO()} /></label>
          <label className="field"><span>Start time</span><input type="time" name="time" required defaultValue={nh} /></label>
        </div>
        <div className="row2">
          <label className="field"><span>Duration</span><select name="dur" defaultValue={60}>{[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
          <label className="field"><span>Max people</span><input type="number" name="cap" min={2} max={100} defaultValue={10} /></label>
        </div>
        <label className="field"><span>Google Meet link</span><input name="link" required inputMode="url" placeholder="https://meet.google.com/abc-defg-hij" autoComplete="off" /></label>
        <p className="hint" style={{ margin: '-6px 0 14px' }}>No link yet? <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer">Start a new Google Meet</a>, copy the meeting link and paste it here.</p>
        <label className="field"><span>What you&apos;ll cover (optional)</span><textarea name="desc" rows={3} maxLength={240} placeholder="e.g. We'll solve last year's paper together, cameras optional" /></label>
        <p className="err" role="alert">{err}</p>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>Host session</button></div>
      </form>
    </Modal>
  );
}

export default function StudyPage() {
  const state = useFetch<Payload>('/study');
  const courses = useFetch<Course[]>('/courses');
  const [filter, setFilter] = useState<'all' | 'going' | 'mine'>('all');
  const [subject, setSubject] = useState('');
  const [hosting, setHosting] = useState(false);
  useTick(30000);
  usePage('Study rooms', state.data ? `Group study on Google Meet for ${state.data.batch}` : 'Group study on Google Meet');

  return (
    <Async state={state}>
      {(d) => {
        const all = d.sessions.filter((s) => sessionStatus(s).k !== 'ended');
        const counts = { all: all.length, going: all.filter((s) => s.imGoing).length, mine: all.filter((s) => s.isHost).length };
        let list = filter === 'going' ? all.filter((s) => s.imGoing) : filter === 'mine' ? all.filter((s) => s.isHost) : all;
        if (subject) list = list.filter((s) => (subject === 'GEN' ? !s.course : s.course?.id === subject));
        const live = all.filter((s) => sessionStatus(s).k === 'live').length;
        const emptyMsg = filter === 'mine' ? "You aren't hosting any sessions." : filter === 'going' ? "You haven't joined any sessions yet." : 'No sessions for this subject yet.';
        return (
          <>
            <div className="banner">
              <Icon name="users" size={18} />
              <span>Only students in <b>{d.batch}</b> can see and join these sessions.{live ? <b> {live} live now.</b> : null}</span>
              <button className="btn primary sm" onClick={() => setHosting(true)}><Icon name="plus" size={16} />Host a session</button>
            </div>
            <div className="card">
              <header className="card-h" style={{ borderBottom: 0 }}>
                <div className="tabs" role="tablist">
                  {([['all', 'Upcoming'], ['going', 'Going'], ['mine', 'Hosting']] as const).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={filter === k} className={`tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}<span>{counts[k]}</span></button>
                  ))}
                </div>
                <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter by subject" style={{ width: 'auto' }}>
                  <option value="">All subjects</option>
                  {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.code}, {c.name}</option>)}
                  <option value="GEN">General</option>
                </select>
              </header>
            </div>
            {list.length ? (
              <div className="sess-grid">{list.map((s) => <SessionCard key={s.id} s={s} onChange={state.reload} />)}</div>
            ) : (
              <div className="card mt"><Empty>{emptyMsg} <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setHosting(true)}>Host a session</button></Empty></div>
            )}
            {hosting && <HostModal courses={courses.data ?? []} onClose={() => setHosting(false)} onDone={() => { setHosting(false); setFilter('mine'); setSubject(''); state.reload(); }} />}
          </>
        );
      }}
    </Async>
  );
}
