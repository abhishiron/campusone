'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { hue, initials } from '@/lib/format';
import { ApiError, openFile } from '@/lib/api';
import type { FileRef } from '@/lib/types';

/* ---------- toasts ---------- */
type ToastKind = 'success' | 'error';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 3400);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            <Icon name={t.kind === 'error' ? 'alert' : 'check'} size={16} />{t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Runs an async action, toasting the server's message on failure. Returns a busy flag. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) toast(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong. Try again.', 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}

/* ---------- building blocks ---------- */
export function Avatar({ name, lg = false }: { name: string; lg?: boolean }) {
  return <span className={`av ${lg ? 'lg' : ''}`} style={{ '--h': hue(name) } as React.CSSProperties} aria-hidden="true">{initials(name)}</span>;
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="stat-l">{label}</span>
      <b className="stat-v">{value}</b>
      {note && <span className="stat-n">{note}</span>}
    </div>
  );
}

export function Panel({ title, extra, children, flush = false, className = '' }: { title: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-h"><h2>{title}</h2>{extra}</header>
      <div className={`card-b ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export type Tone = 'ok' | 'warn' | 'bad' | 'acc' | '';
export const Pill = ({ tone = '', children, className = '' }: { tone?: Tone; children: React.ReactNode; className?: string }) => <span className={`pill ${tone} ${className}`}>{children}</span>;

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>;
export const Loading = ({ label = 'Loading' }: { label?: string }) => <div className="loading" role="status"><i />{label}…</div>;

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** Shows loading or error states, otherwise renders the children with the data. */
export function Async<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => React.ReactNode }) {
  if (state.error && !state.data) return <ErrorNote message={state.error} onRetry={state.reload} />;
  if (!state.data) return <Loading />;
  return <>{children(state.data)}</>;
}

export function Track({ pct, tone = '', marker = false, warnAt }: { pct: number; tone?: string; marker?: boolean; warnAt?: number }) {
  return (
    <div className={`track ${marker ? 'mark' : ''} ${warnAt ? 'wm' : ''}`} style={warnAt ? ({ '--w': `${warnAt}%` } as React.CSSProperties) : undefined}
      role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** Attachments that open in a new tab through the authenticated file endpoint. */
export function Attachments({ files }: { files: (FileRef | null | undefined)[] }) {
  const toast = useToast();
  const list = files.filter((f): f is FileRef => !!f);
  if (!list.length) return null;
  return (
    <div>
      {list.map((f) => (
        <button key={f.id} type="button" className="attach" onClick={() => openFile(f.id).catch((e) => toast(e.message, 'error'))}>
          <Icon name="clip" size={14} />{f.name}
        </button>
      ))}
    </div>
  );
}

/** File picker styled as a drop zone. */
export function DropZone({ label, hint, accept, multiple, onFiles, chosen }: { label: string; hint: string; accept: string; multiple?: boolean; onFiles: (f: File[]) => void; chosen?: string }) {
  const [over, setOver] = useState(false);
  return (
    <label className={`drop ${over ? 'over' : ''} ${chosen ? 'has' : ''}`} onDragEnter={() => setOver(true)} onDragOver={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
      <input type="file" accept={accept} multiple={multiple} aria-label={label} onChange={(e) => { onFiles([...(e.target.files ?? [])]); if (multiple) e.target.value = ''; }} />
      <span><Icon name="upload" />{chosen || label}</span>
      <small>{hint}</small>
    </label>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input:not([type=file]):not([type=radio]),select,textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-h">
          <h2>{title}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="card-b">{children}</div>
      </div>
    </div>
  );
}

export function IconBtn({ icon, label, onClick, sm = true, disabled }: { icon: IconName; label: string; onClick: () => void; sm?: boolean; disabled?: boolean }) {
  return <button className={`icon-btn ${sm ? 'sm' : ''}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}><Icon name={icon} size={sm ? 16 : 18} /></button>;
}

/* ---------- attendance helpers shared by several pages ---------- */
export const levelTone = (l: string): Tone => (l === 'DANGER' ? 'bad' : l === 'WARN' ? 'warn' : 'ok');
export const LEVEL_TEXT: Record<string, string> = { OK: 'Safe', WARN: 'Close to 75%', DANGER: 'Below 75%' };
export const pctTone = (p: number | null, warnAt = 80): Tone => (p === null ? '' : p < 75 ? 'bad' : p < warnAt ? 'warn' : 'ok');
