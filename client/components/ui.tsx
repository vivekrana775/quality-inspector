import type { ReactNode } from 'react';
import { ClipboardList, Clock3, CheckCircle2, RefreshCw, LoaderCircle } from 'lucide-react';
import type { Summary } from '../../shared/schema';

export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <span aria-hidden="true" className="badge-dot" />
      {value}
    </span>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} />
          Try again
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" />
      Loading inspections…
    </div>
  );
}
export function Field({
  label,
  required,
  error,
  id,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  error?: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
export function MetricCards({ summary, loading }: { summary?: Summary; loading: boolean }) {
  return (
    <div className="metrics">
      {[
        {
          label: 'Total inspections',
          value: summary?.total,
          icon: ClipboardList,
          className: 'neutral',
          caption: 'All recorded checks',
        },
        {
          label: 'Open inspections',
          value: summary?.open,
          icon: Clock3,
          className: 'amber',
          caption: 'Awaiting resolution',
        },
        {
          label: 'Resolved inspections',
          value: summary?.resolved,
          icon: CheckCircle2,
          className: 'green',
          caption: 'Action completed',
        },
      ].map(({ label, value, icon: Icon, className, caption }) => (
        <section className={`metric ${className}`} key={label} aria-label={label}>
          <div>
            <p>{label}</p>
            <strong>{loading || value === undefined ? '—' : value}</strong>
            <span className="metric-caption">{caption}</span>
          </div>
          <span className="metric-icon">
            <Icon size={22} strokeWidth={1.7} />
          </span>
        </section>
      ))}
    </div>
  );
}
