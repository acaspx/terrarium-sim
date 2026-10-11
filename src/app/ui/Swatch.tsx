import { useEffect, useState, type ReactNode } from 'react';
import { hasWebGL } from '../jar/Jar3D.js';

const images = new Map<string, string | null>();

/** The rendered preview for a swatch key, once it is ready (null while loading, or without WebGL). */
export function useSwatch(key: string): string | null {
  const [src, setSrc] = useState(() => images.get(key) ?? null);
  useEffect(() => {
    if (images.has(key)) {
      setSrc(images.get(key) ?? null);
      return;
    }
    if (!hasWebGL()) return;
    let live = true;
    import('../three/swatches.js')
      .then((m) => m.renderSwatch(key))
      .then((url) => {
        images.set(key, url);
        if (live) setSrc(url);
      })
      .catch(() => images.set(key, null));
    return () => {
      live = false;
    };
  }, [key]);
  return src;
}

/** A flat colour for each swatch, shown until its picture is ready and when there is no WebGL. */
const TINTS: Record<string, string> = {
  'substrate:abg': '#5b4330', 'substrate:bioactive': '#4a3526', 'substrate:peat': '#6b4b31', 'substrate:potting-soil': '#3d2f26',
  'drainage:leca': '#a5633a', 'drainage:gravel': '#8d918c',
  'hardscape:wood': '#857360', 'hardscape:stone': '#8e938c', 'hardscape:leaf-litter': '#a0703a',
  'lid:cork': '#b88c5e', 'moisture:dry': '#7a6047', 'moisture:damp': '#4a3526', 'moisture:wet': '#2a1e16',
  'placement:dim-corner': '#4b4a52', 'placement:north-window': '#cfe0f0', 'placement:east-window': '#f7e6c8',
  'placement:grow-light': '#e7dcef', 'placement:south-window': '#fff1cc',
};
const tintOf = (key: string) => TINTS[key] ?? (key.startsWith('plant:') ? '#6f9a5a' : key.startsWith('crew:') ? '#c9c3b8' : '#dfe8e3');

export interface SwatchProps {
  /** What to render, e.g. "substrate:peat". */
  k: string;
  label: ReactNode;
  detail?: string;
  selected?: boolean;
  /** radio for one-of-many, toggle for on/off, action for "add one". */
  kind?: 'radio' | 'toggle' | 'action';
  badge?: ReactNode;
  disabled?: boolean;
  empty?: boolean;
  onClick: () => void;
}

export function Swatch({ k, label, detail, selected = false, kind = 'radio', badge, disabled, empty, onClick }: SwatchProps) {
  const src = useSwatch(k);
  const state = kind === 'radio' ? { role: 'radio', 'aria-checked': selected } : kind === 'toggle' ? { 'aria-pressed': selected } : {};
  return (
    <button type="button" className={`swatch${selected ? ' on' : ''}`} title={detail} disabled={disabled} onClick={onClick} {...state}>
      <span className={`swatch-disc${empty ? ' empty' : ''}`} style={empty ? undefined : { backgroundColor: tintOf(k) }}>
        {src && <img src={src} alt="" draggable={false} />}
        {badge !== undefined && <span className="swatch-badge" aria-hidden="true">{badge}</span>}
      </span>
      <span className="swatch-label">{label}</span>
    </button>
  );
}

export function SwatchRow({ label, children, multi = false }: { label: string; children: ReactNode; multi?: boolean }) {
  return (
    <div className="swatch-row" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {children}
    </div>
  );
}
