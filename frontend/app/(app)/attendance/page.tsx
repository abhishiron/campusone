'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch, useStudentQuery, useTick } from '@/lib/hooks';
import { ago, fmtDate, fmtDist, hm, plural, todayISO } from '@/lib/format';
import { DESKTOP_KEY, usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Avatar, Empty, Loading, Modal, Panel, Pill, Stat, Track, LEVEL_TEXT, levelTone, pctTone, useAction, useToast } from '@/components/ui';
import { RiskBanner, Spark, attNote } from '@/components/attendance';
import type { AttendanceSummary, Campus, CheckInRec, Course, Level, RosterRow, TrackerCourse } from '@/lib/types';

/* ================= professor ================= */
const OK_ST = ['VERIFIED', 'APPROVED'];
const ciLabel = (s: string) => ({ VERIFIED: 'Verified', APPROVED: 'Approved', REJECTED: 'Rejected', NEEDS_REVIEW: 'Needs review' })[s] ?? s;
const ciTone = (s: string) => (OK_ST.includes(s) ? 'ok' : s === 'REJECTED' ? 'bad' : 'warn');
const CiPill = ({ status }: { status: string }) => <Pill tone={ciTone(status)}>{ciLabel(status)}</Pill>;

interface WindowState { campus: Campus; open: { id: string; courseId: string; code: string; until: string } | null; total: number; checkIns: CheckInRec[] }

function Countdown({ until }: { until: string }) {
  useTick(1000);
  const ms = new Date(until).getTime() - Date.now();
  return <>{ms > 0 ? `${Math.floor(ms / 6e4)}:${String(Math.floor(ms / 1e3) % 60).padStart(2, '0')}` : '0:00'}</>;
}

function CheckinPanel({ courseId, code, date, onCheckIns }: { courseId: string; code: string; date: string; onCheckIns: (c: CheckInRec[]) => void }) {
  const state = useFetch<WindowState>(`/checkin/window?courseId=${courseId}&date=${date}`);
  const { busy, run } = useAction();
  const toast = useToast();
  const [minutes, setMinutes] = useState(10);
  const [photo, setPhoto] = useState<CheckInRec | null>(null);
  const w = state.data;
  const here = w?.open?.courseId === courseId && new Date(w.open.until).getTime() > Date.now();

  // Poll while a window is open so new check-ins appear live.
  useEffect(() => {
    if (!here) return;
    const t = setInterval(state.reload, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, courseId, date]);
  useEffect(() => { if (w) onCheckIns(w.checkIns); }, [w, onCheckIns]);

  const open = () => run(() => api('/checkin/window', { method: 'POST', body: { courseId, minutes } }), `Check-in open for ${minutes} minutes. Students can check in from their phones.`).then(state.reload);
  const close = (id: string) => run(() => api(`/checkin/window/${id}/close`, { method: 'POST' }), 'Check-in closed').then(state.reload);
  const decide = (c: CheckInRec, status: 'APPROVED' | 'REJECTED') =>
    run(() => api(`/checkin/${c.id}/decide`, { method: 'POST', body: { status } }), `${c.name?.split(' ')[0]}'s check-in ${status.toLowerCase()}`).then(state.reload);
  const moveHere = () => {
    if (!navigator.geolocation) return toast("This browser can't share location.", 'error');
    navigator.geolocation.getCurrentPosition(
      (p) => run(() => api('/checkin/campus', { method: 'PUT', body: { lat: p.coords.latitude, lng: p.coords.longitude } }), 'Campus boundary moved to your current location for testing').then(state.reload),
      () => toast('Location permission is needed to move the boundary. Allow it in your browser settings.', 'error'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  if (!w) return <div className="mt" style={{ marginTop: 0, marginBottom: 16 }}><Panel title="Self check-in"><Loading /></Panel></div>;
  return (
    <div style={{ marginBottom: 16 }}>
      <Panel title="Self check-in">
        {here ? (
          <div className="ci-live">
            <Pill tone="ok"><i className="pdot" />Open</Pill>
            <span>Closes in <span className="count"><Countdown until={w.open!.until} /></span></span>
            <span><b>{w.checkIns.length}</b> of {w.total} checked in</span>
            <button className="btn sm" disabled={busy} onClick={() => close(w.open!.id)}>Close check-in</button>
          </div>
        ) : w.open ? (
          <>
            <p className="hint">Check-in is open for {w.open.code} until {hm(w.open.until)}. Close it before starting another.</p>
            <button className="btn sm" disabled={busy} onClick={() => close(w.open!.id)}>Close check-in for {w.open.code}</button>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginBottom: 10 }}>Students check in from their phones. The server checks they&apos;re inside the campus boundary and stores a live, time-stamped selfie. Verified check-ins mark them present automatically.</p>
            <div className="tools">
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Window length">{[5, 10, 15].map((m) => <option key={m} value={m}>Open for {m} min</option>)}</select>
              <button className="btn primary sm" disabled={busy} onClick={open}><Icon name="pin" size={16} />Start check-in for {code}</button>
            </div>
          </>
        )}
        {w.checkIns.length > 0 && (
          <div className="ci-tiles">
            {w.checkIns.map((c) => (
              <div key={c.id} className="ci-tile">
                <button className="thumb" onClick={() => setPhoto(c)} aria-label={`View ${c.name}'s selfie`}><img src={c.photo} alt="" /></button>
                <div className="bd">
                  <b>{c.name}</b>
                  <span className="hint">{hm(c.createdAt)}, {fmtDist(c.dist)}, ±{Math.round(c.acc)} m</span>
                  {c.flags.length > 0 && <span className="flags">{c.flags.join('. ')}</span>}
                  <div className="row-btns">
                    <CiPill status={c.status} />
                    {c.status === 'NEEDS_REVIEW' && <>
                      <button className="btn sm" disabled={busy} onClick={() => decide(c, 'REJECTED')}>Reject</button>
                      <button className="btn sm primary" disabled={busy} onClick={() => decide(c, 'APPROVED')}>Approve</button>
                    </>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="geo-line">
          <Icon name="pin" size={14} /><span>Boundary: {w.campus.name}, {w.campus.radius} m radius</span>
          <button className="btn sm ghost" disabled={busy} onClick={moveHere}>Use my location as campus</button><span>for testing away from college</span>
        </div>
      </Panel>
      {photo && (
        <Modal title={photo.name ?? 'Check-in'} onClose={() => setPhoto(null)}>
          <img src={photo.photo} alt="Check-in selfie" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>Class</dt><dd>{code}, {fmtDate(photo.date)}</dd>
            <dt>Time</dt><dd>{hm(photo.createdAt)}</dd>
            <dt>Distance</dt><dd>{fmtDist(photo.dist)} from campus centre</dd>
            <dt>GPS accuracy</dt><dd>±{Math.round(photo.acc)} m</dd>
            <dt>Photo</dt><dd>{photo.method === 'LIVE' ? 'Live camera' : 'Camera app upload'}</dd>
            <dt>Status</dt><dd><CiPill status={photo.status} /></dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}

interface Recent { courseId: string; date: string; present: number; total: number; code: string; name: string }

function TeacherAttendance() {
  usePage('Attendance', 'Mark attendance for your classes');
  const courses = useFetch<Course[]>('/courses');
  const recent = useFetch<Recent[]>('/attendance/recent');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const { busy, run } = useAction();

  useEffect(() => {
    if (!courses.data?.length || courseId) return;
    const q = new URLSearchParams(window.location.search).get('course');
    setCourseId(courses.data.find((c) => c.id === q)?.id ?? courses.data[0].id);
  }, [courses.data, courseId]);

  const roster = useFetch<{ existing: boolean; rows: RosterRow[] }>(courseId ? `/attendance/roster?courseId=${courseId}&date=${date}` : null);
  useEffect(() => {
    if (roster.data) setMarks(Object.fromEntries(roster.data.rows.map((r) => [r.studentId, r.status ? r.status !== 'ABSENT' : true])));
  }, [roster.data]);
  const applyCheckIns = useMemo(() => (list: CheckInRec[]) => {
    setMarks((m) => {
      const next = { ...m };
      for (const c of list) if (OK_ST.includes(c.status)) next[c.studentId] = true; else if (c.status === 'REJECTED') next[c.studentId] = false;
      return next;
    });
  }, []);

  if (courses.error) return <Async state={courses}>{() => null}</Async>;
  if (!courses.data) return <Loading />;
  if (!courses.data.length) return <Empty>You have no courses assigned yet.</Empty>;
  const course = courses.data.find((c) => c.id === courseId) ?? courses.data[0];
  const rows = roster.data?.rows ?? [];
  const present = rows.filter((r) => marks[r.studentId]).length;

  const save = async () => {
    const r = await run(() => api<{ present: number; saved: number; warned: string[] }>('/attendance/mark', {
      method: 'POST', body: { courseId: course.id, date, records: rows.map((x) => ({ studentId: x.studentId, status: marks[x.studentId] ? 'PRESENT' : 'ABSENT' })) },
    }), (x) => `Attendance saved: ${x.present} of ${x.saved} present.${x.warned.length ? ` ${x.warned.join(', ')} ${x.warned.length === 1 ? 'is' : 'are'} now at risk and ${x.warned.length === 1 ? 'has' : 'have'} been warned.` : ''}`);
    if (r) { roster.reload(); recent.reload(); }
  };

  return (
    <>
      {date === todayISO() && <CheckinPanel key={course.id} courseId={course.id} code={course.code} date={date} onCheckIns={applyCheckIns} />}
      <section className="card">
        <header className="card-h">
          <div className="tools">
            <select value={course.id} onChange={(e) => setCourseId(e.target.value)} aria-label="Course">{courses.data.map((c) => <option key={c.id} value={c.id}>{c.code}, {c.name}</option>)}</select>
            <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          </div>
          <div className="tools">
            <span className="counter">Present <b>{present}</b> of <b>{rows.length}</b></span>
            <button className="btn sm" onClick={() => setMarks(Object.fromEntries(rows.map((r) => [r.studentId, true])))}>Mark all present</button>
          </div>
        </header>
        <div className="card-b flush">
          {!roster.data ? <Loading /> : (
            <ul className="roster">
              {rows.map((s) => {
                const on = !!marks[s.studentId];
                return (
                  <li key={s.studentId}>
                    <div className="who">
                      <Avatar name={s.name} />
                      <div><b>{s.name}</b><small className="mono">{s.rollNo}</small></div>
                      {s.checkIn && <span className={`pill ${ciTone(s.checkIn)} hide-s`} title={`Self check-in ${ciLabel(s.checkIn).toLowerCase()}`}><Icon name="pin" size={12} />{OK_ST.includes(s.checkIn) ? 'Checked in' : ciLabel(s.checkIn)}</span>}
                    </div>
                    <div className="seg" role="group" aria-label={`Attendance for ${s.name}`}>
                      <button className={`p ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setMarks((m) => ({ ...m, [s.studentId]: true }))}>Present</button>
                      <button className={`a ${on ? '' : 'on'}`} aria-pressed={!on} onClick={() => setMarks((m) => ({ ...m, [s.studentId]: false }))}>Absent</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="card-f">
          {roster.data?.existing && <span className="hint">Already saved for this date. Saving again updates it.</span>}
          <button className="btn primary" disabled={busy || !rows.length} onClick={save}><Icon name="check" size={16} />Save attendance</button>
        </footer>
      </section>
      <div className="mt">
        <Panel title="Recently saved">
          {recent.data?.length ? (
            <ul className="list">
              {recent.data.map((l) => (
                <li key={l.courseId + l.date}>
                  <span className="time">{fmtDate(l.date)}</span>
                  <div className="grow"><b>{l.name}</b><small>{l.code}</small></div>
                  <Pill tone={l.present / l.total >= 0.75 ? 'ok' : 'warn'}>{l.present} of {l.total} present</Pill>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing saved yet. Mark the roster above and save.</Empty>}
        </Panel>
      </div>
    </>
  );
}

/* ================= student and parent tracker ================= */
function Simulator({ courses, warnAt }: { courses: TrackerCourse[]; warnAt: number }) {
  const [code, setCode] = useState(courses[0]?.code ?? '');
  const x = courses.find((c) => c.code === code) ?? courses[0];
  const maxN = Math.max(1, Math.min(15, x?.rem || 15));
  const [n, setN] = useState(5);
  const [m, setM] = useState(3);
  if (!x) return null;
  const nn = Math.min(n, maxN), mm = Math.min(m, nn);
  const np = ((x.a + mm) / (x.t + nn)) * 100;
  const lv: Level = np < 75 ? 'DANGER' : np < warnAt ? 'WARN' : 'OK';
  const d = np - (x.pct ?? 0);
  const safeM = Math.max(0, Math.ceil(0.75 * (x.t + nn) - x.a));
  return (
    <div className="sim">
      <label className="field"><span>Subject</span><select value={x.code} onChange={(e) => setCode(e.target.value)}>{courses.map((c) => <option key={c.code} value={c.code}>{c.code}, {c.name}</option>)}</select></label>
      <label className="field"><span>Next <b>{nn}</b> classes</span><input type="range" min={1} max={maxN} value={nn} onChange={(e) => setN(Number(e.target.value))} /></label>
      <label className="field"><span>I&apos;ll attend <b>{mm}</b> of them</span><input type="range" min={0} max={nn} value={mm} onChange={(e) => setM(Number(e.target.value))} /></label>
      <div className="sim-out" aria-live="polite">
        <div className="sim-v"><span className={`pct ${pctTone(np, warnAt)}`}>{np.toFixed(1)}%</span><Pill tone={levelTone(lv)}>{LEVEL_TEXT[lv]}</Pill></div>
        <p>{(x.pct ?? 0).toFixed(1)}% now, {d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)} points after these {plural(nn, 'class')}.</p>
        <p className="hint">{safeM > nn ? `Even attending all ${nn} keeps you below 75%.` : `Attend at least ${safeM} of the next ${nn} to stay at or above 75%.`}</p>
      </div>
    </div>
  );
}

function AlertSettings({ s, onChange }: { s: AttendanceSummary; onChange: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { run } = useAction();
  const [desk, setDesk] = useState(false);
  useEffect(() => setDesk(localStorage.getItem(DESKTOP_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted'), []);
  const patch = (body: object, msg: string) => run(() => api('/attendance/settings', { method: 'PATCH', body }), msg).then(onChange);
  const deskOn = async () => {
    if (!('Notification' in window)) return toast("This browser doesn't support desktop notifications.", 'error');
    const p = await Notification.requestPermission();
    if (p !== 'granted') return toast('Notifications are blocked. Allow them for this site in your browser settings.', 'error');
    localStorage.setItem(DESKTOP_KEY, '1'); setDesk(true);
    new Notification('CampusOne', { body: 'Desktop alerts are on. You will be warned when a subject gets close to 75%.' });
    toast('Desktop alerts turned on');
  };
  return (
    <>
      <label className="field"><span>Warn me when a subject drops below</span>
        <select value={s.warnAt} onChange={(e) => patch({ warnAt: Number(e.target.value) }, `You'll be warned when a subject drops below ${e.target.value}%`)}>
          {s.warnOptions.map((v) => <option key={v} value={v}>{v}%</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked disabled />In-app notification and pop-up at sign-in</label>
      <label className="check">
        <input type="checkbox" checked={s.alertParent} disabled={!s.hasParent} onChange={(e) => patch({ alertParent: e.target.checked }, e.target.checked ? 'Your parent will be notified too' : 'Parent alerts turned off')} />
        {s.hasParent ? "Also notify my parent's CampusOne account" : 'Notify my parent (no parent account is linked yet)'}
      </label>
      <div className="desk">
        <span>{desk ? 'Desktop alerts are on for this browser.' : `Get a desktop notification while ${user?.role === 'STUDENT' ? 'CampusOne' : 'this page'} is open in the background.`}</span>
        {desk ? <button className="btn sm ghost" onClick={() => { localStorage.removeItem(DESKTOP_KEY); setDesk(false); toast('Desktop alerts turned off'); }}>Turn off</button>
          : <button className="btn sm" onClick={deskOn}>Turn on desktop alerts</button>}
      </div>
    </>
  );
}

function Tracker({ parent }: { parent: boolean }) {
  const { activeStudent } = useAuth();
  const { sep, ready } = useStudentQuery();
  usePage(parent ? `${activeStudent?.name.split(' ')[0] ?? 'Child'}'s attendance` : 'Attendance tracker', 'Minimum 75% in every subject to sit the exams');
  const state = useFetch<AttendanceSummary>(ready ? sep('/attendance/summary') : null);
  const { run } = useAction();
  return (
    <Async state={state}>
      {(s) => {
        const cnt = (l: Level) => s.courses.filter((x) => x.level === l).length;
        const unread = s.alerts.filter((a) => !a.read).length;
        const readAll = () => run(() => api(sep('/attendance/alerts/read'), { method: 'POST' })).then(() => { state.reload(); window.dispatchEvent(new Event('campusone-refresh')); });
        return (
          <>
            <RiskBanner courses={s.courses} showLink={false} />
            <div className="stats">
              <Stat label="Overall" value={s.overall === null ? '—' : `${s.overall.toFixed(1)}%`} note={`${s.attended} of ${s.total} classes`} tone={s.overall !== null && s.overall < s.warnAt ? 'warn' : undefined} />
              <Stat label="Safe" value={cnt('OK')} note={`At or above ${s.warnAt}%`} />
              <Stat label="Close to limit" value={cnt('WARN')} note={`Between 75% and ${s.warnAt}%`} tone={cnt('WARN') ? 'warn' : undefined} />
              <Stat label="Below 75%" value={cnt('DANGER')} note={cnt('DANGER') ? 'Exam eligibility at risk' : 'None'} tone={cnt('DANGER') ? 'warn' : undefined} />
            </div>
            <div className="grid-2">
              <Panel title="By subject" extra={<span className="hint legend-m"><i className="lm75" />75% <i className="lmw" />{s.warnAt}% warning</span>}>
                {s.courses.map((x) => (
                  <div key={x.code} className="trk">
                    <div className="trk-h">
                      <div><b>{x.name}</b><small className="mono">{x.code}</small></div>
                      <div className="trk-r">{x.pct !== null && <Spark hist={x.hist} cur={x.pct} />}<span className={`pct ${pctTone(x.pct, s.warnAt)}`}>{x.pct === null ? '—' : `${x.pct.toFixed(1)}%`}</span></div>
                    </div>
                    <Track pct={x.pct ?? 0} tone={pctTone(x.pct, s.warnAt)} marker warnAt={s.warnAt} />
                    <div className="trk-f"><Pill tone={levelTone(x.level)}>{LEVEL_TEXT[x.level]}</Pill><span>{x.a} of {x.t} attended</span><span>{x.rem} left this semester</span></div>
                    {x.t > 0 && <p className="att-n">{attNote(x)}</p>}
                  </div>
                ))}
              </Panel>
              <div className="col">
                <Panel title="What if I skip?"><Simulator courses={s.courses.filter((c) => c.t > 0)} warnAt={s.warnAt} /></Panel>
                {!parent && <Panel title="Alert settings"><AlertSettings s={s} onChange={state.reload} /></Panel>}
              </div>
            </div>
            <div className="mt">
              <Panel title="Alert history" extra={unread ? <button className="btn sm ghost" onClick={readAll}>Mark {unread} as read</button> : undefined}>
                {s.alerts.length ? (
                  <ul className="list">
                    {s.alerts.map((a) => (
                      <li key={a.id} className={a.read ? '' : 'unread-li'}>
                        <span className={`ico ${a.level === 'DANGER' ? 'danger' : a.level === 'WARN' ? 'warn' : 'ok'}`}><Icon name={a.level === 'OK' ? 'check' : 'alert'} size={16} /></span>
                        <div className="grow"><b>{a.text}</b><small>{ago(a.createdAt)}, sent by {a.channels.join(', ')}</small></div>
                      </li>
                    ))}
                  </ul>
                ) : <Empty>No alerts yet. You will be notified here when a subject gets close to 75%.</Empty>}
              </Panel>
            </div>
          </>
        );
      }}
    </Async>
  );
}

export default function AttendancePage() {
  const { user } = useAuth();
  if (user!.role === 'TEACHER') return <TeacherAttendance />;
  if (user!.role === 'ADMIN') return <Empty>Attendance is taken by professors.</Empty>;
  return <Tracker parent={user!.role === 'PARENT'} />;
}
