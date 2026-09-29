'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

/* ---------- Toasts ---------- */
type ToastKind = 'success' | 'error';
interface ToastItem { id: number; message: string; kind: ToastKind }
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-2 rounded border border-line bg-surface px-3 py-2.5 text-sm shadow-[0_6px_24px_-8px_rgba(20,40,45,0.25)]">
            {t.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" /> : <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Layout bits ---------- */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-xl text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-lg">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-10 text-muted" role="status">
      <Loader2 size={16} className="animate-spin" /> {label}…
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">
      <span>{message}</span>
      {onRetry && <button className="font-medium underline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="font-serif text-lg">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'ok' | 'bad' | 'warn' | 'mark';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-paper text-muted border-line',
  ok: 'bg-ok/10 text-ok border-ok/25',
  bad: 'bg-bad/10 text-bad border-bad/25',
  warn: 'bg-warn/10 text-warn border-warn/30',
  mark: 'bg-mark/40 text-ink border-mark',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}>{children}</span>;
}

/** A thin bar showing a percentage. Threshold colours it red when under target. */
export function Meter({ value, target = 75 }: { value: number | null; target?: number }) {
  const v = value ?? 0;
  const color = value === null ? 'bg-line' : v >= target ? 'bg-ok' : 'bg-bad';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- Forms ---------- */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ busy, children, className = 'btn-primary', ...rest }: { busy?: boolean; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} disabled={busy || rest.disabled} className={className}>
      {busy && <Loader2 size={15} className="animate-spin" />} {children}
    </button>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full flex-col rounded border border-line bg-surface shadow-[0_20px_60px_-20px_rgba(20,40,45,0.45)] ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-xl">{title}</h2>
          <button data-close aria-label="Close" onClick={onClose} className="rounded p-1 text-muted hover:bg-paper hover:text-ink"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel, busy, onConfirm, onClose }: { title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-quiet" onClick={onClose}>Cancel</button>
        <SubmitButton className="btn-danger" busy={busy} onClick={onConfirm}>{confirmLabel}</SubmitButton>
      </div>
    </Modal>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded px-3.5 py-1.5 text-sm font-medium transition-colors ${value === o.value ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
