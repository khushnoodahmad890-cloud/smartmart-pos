import React, { useEffect, useRef } from 'react';
import { X, Loader2, Inbox, AlertTriangle, CheckCircle2, Info, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToastStore, type Toast } from '../stores/toast';

// ---------- Buttons ----------
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
  secondary: 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300',
};

export function Button({ variant = 'primary', loading, className = '', children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${btnStyles[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---------- Inputs ----------
export function Input({ label, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>}
      <input
        className={`w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>}
      <select
        className={`w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
        {...props}
      >{children}</select>
    </label>
  );
}

export function Textarea({ label, className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>}
      <textarea
        className={`w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
        rows={3}
        {...props}
      />
    </label>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---------- Confirm dialog ----------
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string;
  confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex gap-3 items-start">
        <div className={`p-2 rounded-full ${danger ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40'}`}>
          <AlertTriangle size={20} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 pt-1.5">{message}</p>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ---------- Badge ----------
export function Badge({ color, children }: { color: 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'purple'; children: React.ReactNode }) {
  const map = {
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    purple: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${map[color]}`}>{children}</span>;
}

// ---------- Loading / empty states ----------
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
      <Loader2 size={28} className="animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
      <div className="text-slate-300 dark:text-slate-600">{icon || <Inbox size={40} />}</div>
      <p className="font-medium text-slate-500 dark:text-slate-400">{title}</p>
      {subtitle && <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm">{subtitle}</p>}
    </div>
  );
}

// ---------- Card ----------
export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>{children}</div>;
}

// ---------- Pagination ----------
export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-500 border-t border-slate-200 dark:border-slate-800">
      <span>Page {page} of {pages} · {total.toLocaleString()} records</span>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft size={16} /></button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

// ---------- Toasts ----------
const toastIcons: Record<Toast['type'], React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-emerald-500" />,
  error: <XCircle size={18} className="text-rose-500" />,
  warning: <AlertTriangle size={18} className="text-amber-500" />,
  info: <Info size={18} className="text-sky-500" />,
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm no-print">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-start gap-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl px-4 py-3 animate-[slideIn_.2s_ease-out]">
          {toastIcons[t.type]}
          <p className="text-sm flex-1 text-slate-700 dark:text-slate-200">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// ---------- Stat card ----------
export function StatCard({ label, value, sub, icon, tone = 'indigo' }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'violet';
}) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
  };
  return (
    <Card className="p-4 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
        <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </Card>
  );
}

// ---------- Search input with debounce ----------
export function SearchInput({ onSearch, placeholder = 'Search…', autoFocus }: { onSearch: (q: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return (
    <input
      autoFocus={autoFocus}
      placeholder={placeholder}
      className="w-full sm:w-64 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      onChange={(e) => {
        clearTimeout(timer.current);
        const v = e.target.value;
        timer.current = setTimeout(() => onSearch(v), 300);
      }}
    />
  );
}
