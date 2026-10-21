'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch, useTick } from '@/lib/hooks';
import { fmtDate, fmtDist, hm } from '@/lib/format';
import { usePage } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Async, Empty, Panel, Pill, useAction } from '@/components/ui';
import type { Campus, CheckInRec } from '@/lib/types';

interface Current { campus: Campus; window: { id: string; courseId: string; code: string; name: string; until: string } | null; mine: CheckInRec | null; history: CheckInRec[] }
interface Pos { lat: number; lng: number; acc: number; dist: number; inside: boolean; weak: boolean; sim: boolean }
const OK_ST = ['VERIFIED', 'APPROVED'];
const label = (s: string) => ({ VERIFIED: 'Verified', APPROVED: 'Approved', REJECTED: 'Rejected', NEEDS_REVIEW: 'Needs review' })[s] ?? s;
const StatusPill = ({ s }: { s: string }) => <Pill tone={OK_ST.includes(s) ? 'ok' : s === 'REJECTED' ? 'bad' : 'warn'}>{label(s)}</Pill>;

const distM = (a: number, b: number, c: number, d: number) => {
  const R = 6371e3, t = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Where the student is relative to the geofence, drawn to scale (clamped at the edge when far away). */
function Radar({ campus, pos }: { campus: Campus; pos: Pos }) {
  const R = 46, C = 70, sc = R / campus.radius;
  const dx = distM(campus.lat, campus.lng, campus.lat, pos.lng) * (pos.lng < campus.lng ? -1 : 1);
  const dy = distM(campus.lat, campus.lng, pos.lat, campus.lng) * (pos.lat > campus.lat ? -1 : 1);
  let px = dx * sc, py = dy * sc;
  const d = Math.hypot(px, py), far = d > 62;
  if (far) { px = (px / d) * 62; py = (py / d) * 62; }
  return (
    <svg className="radar" width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`${pos.inside ? 'Inside' : 'Outside'} the campus boundary, ${fmtDist(pos.dist)} from the centre`}>
      <circle cx={C} cy={C} r={66} className="ring" /><circle cx={C} cy={C} r={R} className="fence" /><circle cx={C} cy={C} r={2} className="ctr" />
      {!far && <circle cx={C + px} cy={C + py} r={Math.min(40, pos.acc * sc)} className="acc" />}
      <circle cx={C + px} cy={C + py} r={5} className={`me ${pos.inside ? '' : 'out'}`} />
      <text x={C} y={C - R - 4} textAnchor="middle">{campus.radius} m</text>
      {far && <text x={C} y={136} textAnchor="middle">you are {fmtDist(pos.dist)} away</text>}
    </svg>
  );
}

/** Square-crops the image and stamps name, time, class and distance so the photo can't be reused. */
function stamp(src: CanvasImageSource, sw: number, sh: number, mirror: boolean, lines: string[]) {
  const c = document.createElement('canvas'), Z = 360;
  c.width = c.height = Z;
  const x = c.getContext('2d')!, s = Math.min(sw, sh);
  if (mirror) { x.translate(Z, 0); x.scale(-1, 1); }
  x.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, Z, Z);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, Z - 58, Z, 58); x.fillStyle = '#fff';
  x.font = '600 13px "IBM Plex Sans",sans-serif'; x.fillText(lines[0], 10, Z - 38);
  x.font = '12px "IBM Plex Mono",monospace'; x.fillText(lines[1], 10, Z - 22); x.fillText(lines[2], 10, Z - 7);
  return c.toDataURL('image/jpeg', 0.72);
}

function Steps({ data, onDone }: { data: Current; onDone: () => void }) {
  const { user, activeStudent } = useAuth();
  const { busy, run } = useAction();
  const w = data.window!, campus = data.campus;
  const [sim, setSim] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [posErr, setPosErr] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [method, setMethod] = useState<'LIVE' | 'UPLOAD'>('LIVE');
  const [camOn, setCamOn] = useState(false);
  const [camMsg, setCamMsg] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCamOn(false); };
  useEffect(() => stopCam, []);

  const locate = () => {
    setLocating(true); setPosErr(''); setPos(null); setPhoto(null);
    const done = (lat: number, lng: number, acc: number, simulated: boolean) => {
      const dist = distM(campus.lat, campus.lng, lat, lng);
      setPos({ lat, lng, acc, dist, inside: dist <= campus.radius, weak: acc > 100, sim: simulated });
      setLocating(false);
    };
    const fail = (m: string) => { setPosErr(m); setLocating(false); };
    if (sim) {
      const o = () => (Math.random() - 0.5) * 0.0007;
      setTimeout(() => done(campus.lat + o(), campus.lng + o(), 10 + Math.random() * 18, true), 600);
      return;
    }
    if (!navigator.geolocation) return fail("This browser can't share your location. Try Chrome or Safari on your phone.");
    navigator.geolocation.getCurrentPosition(
      (p) => done(p.coords.latitude, p.coords.longitude, p.coords.accuracy, false),
      (e) => fail(e.code === 1 ? 'Location permission was denied. Allow location for this site in your browser settings, then try again.'
        : e.code === 3 ? 'Finding your location took too long. Move near a window or step outside, then try again.'
        : 'Your location is unavailable. Turn on GPS or location services, then try again.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const stampLines = () => [
    `${user!.name}, ${activeStudent?.rollNo ?? ''}`,
    `${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}  ${w.code}`,
    pos ? `${fmtDist(pos.dist)} from campus, ±${Math.round(pos.acc)} m` : '',
  ];
  const startCam = async () => {
    setCamMsg('');
    if (!navigator.mediaDevices?.getUserMedia) return setCamMsg("The camera can't be opened on this page. Use the phone camera button instead.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
      video.current!.srcObject = stream.current;
      await video.current!.play();
      setCamOn(true);
    } catch (e) {
      stopCam();
      setCamMsg(`${(e as Error)?.name === 'NotAllowedError' ? 'Camera permission was denied.' : "The camera couldn't be opened."} Use the phone camera button instead.`);
    }
  };
  const shoot = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    setPhoto(stamp(v, v.videoWidth, v.videoHeight, true, stampLines()));
    setMethod('LIVE');
    stopCam();
  };
  const fromFile = (f: File | undefined) => {
    if (!f) return;
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => { setPhoto(stamp(img, img.naturalWidth, img.naturalHeight, false, stampLines())); setMethod('UPLOAD'); URL.revokeObjectURL(u); };
    img.onerror = () => setCamMsg("That file isn't a photo. Try again.");
    img.src = u;
  };
  const submit = async () => {
    if (!pos || !photo) return;
    const r = await run(() => api<CheckInRec>('/checkin', { method: 'POST', body: { lat: pos.lat, lng: pos.lng, acc: pos.acc, method, simulated: pos.sim, photo } }),
      (x) => (x.status === 'VERIFIED' ? `You're marked present for ${w.code}` : 'Check-in sent to your professor for review'));
    if (r) onDone();
  };

  const ready = !!pos?.inside;
  return (
    <div className="steps">
      <section className={`step ${ready ? 'done' : ''}`}>
        <div className="step-n">1</div>
        <div className="step-b">
          <h3>Confirm you&apos;re on campus</h3>
          <p>Your location is checked once against the {campus.radius} m campus boundary. It isn&apos;t tracked afterwards.</p>
          {locating ? <p className="hint">Finding your location…</p> : pos ? (
            <div className="loc">
              <Radar campus={campus} pos={pos} />
              <div className="res">
                {pos.inside
                  ? <><b className="y"><Icon name="check" size={16} /> You&apos;re inside the campus boundary</b><span>{fmtDist(pos.dist)} from the centre of {campus.name}, accurate to ±{Math.round(pos.acc)} m.</span></>
                  : <><b className="n"><Icon name="x" size={16} /> You&apos;re outside the campus boundary</b><span>You are {fmtDist(pos.dist)} from {campus.name}. Check-in only works within {campus.radius} m of the campus centre.</span></>}
                {pos.weak && <span className="flags">GPS accuracy is weak (±{Math.round(pos.acc)} m). You can still check in, but your professor will review it. Moving near a window helps.</span>}
                {pos.sim && <span className="hint">Simulated location for the demo. Your professor will review it.</span>}
                <div className="row-btns"><button className="btn sm" onClick={locate}><Icon name="pin" size={15} />Check again</button></div>
              </div>
            </div>
          ) : (
            <>
              {posErr && <p className="err" style={{ margin: '0 0 10px' }}>{posErr}</p>}
              <button className="btn primary" onClick={locate}><Icon name="pin" size={16} />Check my location</button>
            </>
          )}
          <label className="check" style={{ margin: '12px 0 0' }}>
            <input type="checkbox" checked={sim} onChange={(e) => { setSim(e.target.checked); setPos(null); setPhoto(null); setPosErr(''); }} />
            Simulate being on campus (demo only, for testing away from college)
          </label>
        </div>
      </section>

      <section className={`step ${photo ? 'done' : ''} ${ready ? '' : 'locked'}`}>
        <div className="step-n">2</div>
        <div className="step-b">
          <h3>Take a live selfie</h3>
          <p>The photo is stamped with your name, time and distance from campus so it can&apos;t be reused.</p>
          {!ready ? <p className="hint">Confirm your location first.</p> : photo ? (
            <>
              <div className="cam"><img src={photo} alt="Your check-in selfie" /></div>
              <div className="row-btns">
                <button className="btn sm" onClick={() => setPhoto(null)}>Retake photo</button>
                {method === 'UPLOAD' ? <span className="flags">Taken with the phone camera app, so your professor will review it.</span> : <Pill tone="ok">Live photo</Pill>}
              </div>
            </>
          ) : (
            <>
              <div className={`cam ${camOn ? 'on' : ''}`}>
                <video ref={video} playsInline muted />
                <div className="cam-guide" />
                <div className="ph"><Icon name="camera" size={28} /><span>Your face should fill the oval.<br />Good light, no mask or sunglasses.</span></div>
              </div>
              <p className="err" style={{ margin: '0 0 8px' }}>{camMsg}</p>
              <div className="row-btns">
                {camOn ? <button className="btn primary" onClick={shoot}><Icon name="camera" size={16} />Take photo</button>
                  : <button className="btn primary" onClick={startCam}><Icon name="camera" size={16} />Open camera</button>}
                <label className="btn ghost sm">Camera not working? Use phone camera
                  <input type="file" accept="image/*" capture="user" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
                </label>
              </div>
            </>
          )}
        </div>
      </section>

      <section className={`step ${ready && photo ? '' : 'locked'}`}>
        <div className="step-n">3</div>
        <div className="step-b">
          <h3>Mark yourself present</h3>
          <p>{ready && photo ? 'Everything checks out. Submit before the window closes.' : 'Finish steps 1 and 2 to submit.'}</p>
          <button className="btn primary" disabled={!ready || !photo || busy} onClick={submit}><Icon name="check" size={16} />Mark me present</button>
        </div>
      </section>
    </div>
  );
}

export default function CheckinPage() {
  usePage('Check in', 'Mark your own attendance from inside the campus');
  const state = useFetch<Current>('/checkin/current');
  useTick(1000);
  // While no window is open, look again every 10 seconds so the steps appear when the professor opens one.
  useEffect(() => {
    const t = setInterval(() => { if (!state.data?.window) state.reload(); }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data?.window]);

  return (
    <Async state={state}>
      {(d) => {
        const w = d.window && new Date(d.window.until).getTime() > Date.now() ? d.window : null;
        const ms = w ? new Date(w.until).getTime() - Date.now() : 0;
        let main: React.ReactNode;
        if (d.mine && d.window) {
          const m = d.mine;
          main = (
            <Panel title={`Checked in to ${d.window.name}`}>
              <div className="success">
                <img src={m.photo} alt="Your check-in selfie" />
                <div>
                  <p style={{ fontSize: 16, marginBottom: 6 }}><b>{OK_ST.includes(m.status) ? "You're marked present." : 'Check-in received, waiting for review.'}</b></p>
                  <p className="hint">{hm(m.createdAt)}, {fmtDist(m.dist)} from the campus centre, GPS ±{Math.round(m.acc)} m.</p>
                  {m.flags.length > 0 && <p className="flags" style={{ marginTop: 6 }}>{m.flags.join('. ')}. {OK_ST.includes(m.status) ? '' : 'Your professor will approve or reject it.'}</p>}
                  <div style={{ marginTop: 10 }}><StatusPill s={m.status} /></div>
                </div>
              </div>
            </Panel>
          );
        } else if (!w) {
          main = <Panel title="Check in to class"><Empty>Check-in isn&apos;t open right now. Your professor opens it at the start of class, and it stays open for a few minutes. This page updates on its own.</Empty></Panel>;
        } else {
          main = (
            <>
              <div className="banner"><Icon name="clock" size={18} /><span>Check-in is open for <b>{w.name}</b> ({w.code}). Closes in <b>{Math.floor(ms / 6e4)}:{String(Math.floor(ms / 1e3) % 60).padStart(2, '0')}</b>.</span></div>
              <Steps data={d} onDone={state.reload} />
            </>
          );
        }
        return (
          <>
            {main}
            <div className="mt">
              <Panel title="Your recent check-ins">
                {d.history.length ? (
                  <ul className="list">
                    {d.history.map((c) => (
                      <li key={c.id}>
                        <img className="mini" src={c.photo} alt="" />
                        <div className="grow"><b>{c.courseName}</b><small>{fmtDate(c.date)}, {hm(c.createdAt)}, {fmtDist(c.dist)} from centre</small></div>
                        <StatusPill s={c.status} />
                      </li>
                    ))}
                  </ul>
                ) : <Empty>Your check-ins will appear here.</Empty>}
              </Panel>
            </div>
          </>
        );
      }}
    </Async>
  );
}
