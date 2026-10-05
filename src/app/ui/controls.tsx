import type { ReactNode } from 'react';

interface Opt<T extends string | number> { id: T; label: ReactNode; detail?: string; disabled?: boolean }

/** A row of mutually exclusive choices. Renders as a radio group for keyboard and screen readers. */
export function Segmented<T extends string | number>({
  label, options, value, onChange, size = 'md',
}: { label: string; options: Opt<T>[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.id)} type="button" role="radio" aria-checked={o.id === value}
          className={o.id === value ? 'on' : undefined} disabled={o.disabled}
          onClick={() => onChange(o.id)} title={o.detail}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A vertical list of choices that each need a sentence of explanation. */
export function ChoiceList<T extends string>({
  label, options, value, onChange, flags,
}: { label: string; options: Opt<T>[]; value: T; onChange: (v: T) => void; flags?: Partial<Record<T, ReactNode>> }) {
  return (
    <div className="choice-list" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id} type="button" role="radio" aria-checked={o.id === value}
          className={o.id === value ? 'on' : undefined} onClick={() => onChange(o.id)}
        >
          <span className="choice-label">{o.label}</span>
          {o.detail && <span className="choice-detail">{o.detail}</span>}
          {flags?.[o.id]}
        </button>
      ))}
    </div>
  );
}

/** A tiny line chart. Values are drawn against their own range unless min/max are given. */
export function Sparkline({
  values, min, max, width = 160, height = 36, className, band,
}: { values: number[]; min?: number; max?: number; width?: number; height?: number; className?: string; band?: [number, number] }) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden="true" />;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const y = (v: number) => height - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * (height - 4);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 4)).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      {band && <rect x={0} width={width} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} className="spark-band" />}
      <polyline points={pts.join(' ')} fill="none" className="spark-line" />
      <circle cx={width - 4} cy={y(values[values.length - 1]!)} r={2.5} className="spark-dot" />
    </svg>
  );
}

export function Meter({ value, band, label }: { value: number; band?: [number, number]; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      {band && <span className="meter-band" style={{ left: `${band[0] * 100}%`, width: `${(band[1] - band[0]) * 100}%` }} />}
      <span className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
