import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, action, children, className = '' }: PanelProps) {
  return (
    <section
      className={`rounded-2xl border border-border bg-panel/90 p-5 shadow-glow backdrop-blur-sm ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
