import { useId, type ReactNode } from 'react';
import { makeRng } from '../../engine/core/math.js';
import {
  geometry, plantSpecies, SUBSTRATES,
  type LidId, type TerrariumSpec, type TerrariumState, type VesselId,
} from '../../engine/index.js';

/**
 * A side view of the terrarium, drawn from the simulation state.
 * Everything visible maps to something modelled: condensation is the film on
 * the glass, soil darkens with moisture, plants droop with turgor and brown
 * with health, leaf litter shrinks as the crew eats it, and the jar dims at night.
 */

const W = 200;
const H = 280;

interface Vessel {
  body: string;
  /** Visible outline, when it differs from the clip (open bowl). */
  outline?: string;
  floorY: number;
  ground: [number, number];
  highlight: string;
}

const VESSEL: Record<VesselId, Vessel> = {
  jar: {
    body: 'M30,80 Q30,60 54,54 L54,44 L146,44 L146,54 Q170,60 170,80 L170,250 Q170,264 156,264 L44,264 Q30,264 30,250 Z',
    floorY: 262, ground: [34, 166], highlight: 'M40,92 L40,236',
  },
  bottle: {
    body: 'M86,46 L86,104 Q22,118 22,184 Q22,264 100,264 Q178,264 178,184 Q178,118 114,104 L114,46 Z',
    floorY: 262, ground: [30, 170], highlight: 'M40,150 Q32,184 42,226',
  },
  cloche: {
    body: 'M32,252 L32,132 Q32,46 100,46 Q168,46 168,132 L168,252 Z',
    floorY: 251, ground: [34, 166], highlight: 'M44,200 L44,132 Q46,84 78,64',
  },
  bowl: {
    body: 'M60,88 Q8,118 8,174 Q8,264 100,264 Q192,264 192,174 Q192,118 140,88 Z',
    outline: 'M60,88 Q8,118 8,174 Q8,264 100,264 Q192,264 192,174 Q192,118 140,88',
    floorY: 262, ground: [24, 176], highlight: 'M26,150 Q18,180 30,214',
  },
  cube: {
    body: 'M26,58 L174,58 L174,264 L26,264 Z',
    floorY: 262, ground: [28, 172], highlight: 'M36,72 L36,240',
  },
  wardian: {
    body: 'M26,264 L26,118 L100,48 L174,118 L174,264 Z',
    floorY: 262, ground: [28, 172], highlight: 'M36,130 L36,240',
  },
};

const PLANT_COLORS: Record<string, { leaf: string; accent: string }> = {
  fittonia: { leaf: '#2f5e3b', accent: '#f0d4da' },
  'creeping-fig': { leaf: '#4c7a37', accent: '#3a5f2a' },
  'baby-tears-pilea': { leaf: '#73a24a', accent: '#5d8a3b' },
  'spike-moss': { leaf: '#7fa84a', accent: '#5f8a34' },
  'cushion-moss': { leaf: '#8cae7c', accent: '#a9c39a' },
  'maidenhair-fern': { leaf: '#79ac58', accent: '#2a231e' },
};
const DYING = '#9b8650';

function hex(c: string): readonly [number, number, number] {
  if (c.startsWith('rgb')) {
    const [r = 0, g = 0, b = 0] = c.slice(c.indexOf('(') + 1, -1).split(',').map(Number);
    return [r, g, b];
  }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number) {
  const x = hex(a);
  const y = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * k)).join(',')})`;
}
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const hashSeed = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

// ------------------------------------------------------------------ plants

interface PlantDraw {
  x: number;
  gy: number;
  scale: number; // 0..1, share of max biomass (sqrt)
  turgor: number;
  health: number;
  rng: () => number;
  leaf: string;
  accent: string;
  wall: number; // x of the nearest wall, for climbers
  dry: number; // 0..1
}

function fittonia(p: PlantDraw): ReactNode {
  const n = 4 + Math.round(p.scale * 6);
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const spread = -70 + (140 * (i + 0.5)) / n + (p.rng() - 0.5) * 18;
    const droop = (1 - p.turgor) * 75 * Math.sign(spread || 1);
    const a = ((spread + droop) * Math.PI) / 180;
    const len = (9 + 14 * p.scale) * (0.75 + 0.3 * p.rng()) * (0.75 + 0.25 * p.turgor);
    const tx = p.x + Math.sin(a) * len;
    const ty = p.gy - Math.cos(a) * len;
    const rx = 5 + 4 * p.scale;
    const deg = (a * 180) / Math.PI;
    out.push(
      <g key={i}>
        <line x1={p.x} y1={p.gy} x2={tx} y2={ty} stroke={p.leaf} strokeWidth={1.2} />
        <g transform={`rotate(${deg} ${tx} ${ty})`}>
          <ellipse cx={tx} cy={ty - rx * 0.4} rx={rx * 0.62} ry={rx} fill={p.leaf} />
          <line x1={tx} y1={ty + rx * 0.5} x2={tx} y2={ty - rx * 1.3} stroke={p.accent} strokeWidth={0.7} />
          <path d={`M${tx - rx * 0.55},${ty - rx * 0.1} L${tx},${ty - rx * 0.5} L${tx + rx * 0.55},${ty - rx * 0.1}`} stroke={p.accent} strokeWidth={0.5} fill="none" />
        </g>
      </g>,
    );
  }
  return out;
}

function creepingFig(p: PlantDraw): ReactNode {
  // Runs along the soil to the glass, then climbs it.
  const total = 20 + 200 * p.scale * p.scale;
  const dir = p.wall > p.x ? 1 : -1;
  const groundRun = Math.min(total, Math.abs(p.wall - p.x));
  const pts: [number, number][] = [];
  for (let d = 0; d <= total; d += 6) {
    if (d <= groundRun) pts.push([p.x + dir * d, p.gy - 2 - Math.sin(d / 9) * 1.5]);
    else pts.push([p.wall - dir * 3 + Math.sin(d / 7) * 1.5, p.gy - 2 - (d - groundRun)]);
  }
  const path = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  const r = 3.2 * (0.8 + 0.2 * p.turgor);
  return (
    <g>
      <path d={path} stroke={p.accent} strokeWidth={1} fill="none" />
      {pts.map((q, i) => (
        <ellipse key={i} cx={q[0] + (i % 2 ? 2.5 : -2.5)} cy={q[1] - 1.5 + (1 - p.turgor) * 2} rx={r} ry={r * 0.8} fill={p.leaf} />
      ))}
    </g>
  );
}

function babyTears(p: PlantDraw): ReactNode {
  const w = 12 + 30 * p.scale;
  const h = (5 + 11 * p.scale) * (0.45 + 0.55 * p.turgor);
  const n = 14 + Math.round(36 * p.scale);
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const u = p.rng() * 2 - 1;
    const v = p.rng();
    const x = p.x + u * w * 0.5;
    const y = p.gy - v * h * Math.sqrt(1 - u * u);
    out.push(<circle key={i} cx={x} cy={y} r={2.1} fill={i % 3 ? p.leaf : p.accent} />);
  }
  return out;
}

function spikeMoss(p: PlantDraw): ReactNode {
  const n = 3 + Math.round(4 * p.scale);
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1;
    const len = (10 + 22 * p.scale) * (0.7 + 0.3 * p.rng());
    const lift = (6 + 8 * p.rng()) * (0.4 + 0.6 * p.turgor);
    const ex = p.x + dir * len;
    const ey = p.gy - 2 - p.rng() * 3;
    const cx = p.x + dir * len * 0.5;
    const cy = p.gy - lift;
    const ticks: ReactNode[] = [];
    for (let t = 0.15; t < 1; t += 0.12) {
      const bx = (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * cx + t * t * ex;
      const by = (1 - t) * (1 - t) * p.gy + 2 * (1 - t) * t * cy + t * t * ey;
      ticks.push(<line key={t} x1={bx} y1={by} x2={bx + dir * 2.5} y2={by - 3} stroke={p.leaf} strokeWidth={1.4} strokeLinecap="round" />);
      ticks.push(<line key={`b${t}`} x1={bx} y1={by} x2={bx + dir * 2.5} y2={by + 2} stroke={p.accent} strokeWidth={1.2} strokeLinecap="round" />);
    }
    out.push(
      <g key={i}>
        <path d={`M${p.x},${p.gy} Q${cx},${cy} ${ex},${ey}`} stroke={p.leaf} strokeWidth={1.6} fill="none" />
        {ticks}
      </g>,
    );
  }
  return out;
}

function cushionMoss(p: PlantDraw): ReactNode {
  const w = 16 + 34 * p.scale;
  const h = 7 + 15 * p.scale;
  const base = mix(p.leaf, '#cfdac9', p.dry * 0.8);
  const n = 18 + Math.round(30 * p.scale);
  const bumps: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    const y = p.gy - h * Math.sqrt(Math.max(0, 1 - u * u)) + p.rng() * 4;
    bumps.push(<circle key={i} cx={p.x + u * w * 0.5} cy={y} r={2.2 + p.rng() * 1.6} fill={i % 2 ? base : mix(p.accent, '#dfe7da', p.dry)} />);
  }
  return (
    <g>
      <path d={`M${p.x - w / 2},${p.gy} Q${p.x - w / 2},${p.gy - h * 1.15} ${p.x},${p.gy - h} Q${p.x + w / 2},${p.gy - h * 1.15} ${p.x + w / 2},${p.gy} Z`} fill={base} />
      {bumps}
    </g>
  );
}

function maidenhair(p: PlantDraw): ReactNode {
  const n = 3 + Math.round(4 * p.scale);
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1;
    const ht = (18 + 46 * p.scale) * (0.7 + 0.3 * p.rng());
    const bend = (8 + 14 * p.rng() + (1 - p.turgor) * 26) * dir;
    const ex = p.x + bend * 1.4;
    const ey = p.gy - ht * (0.55 + 0.45 * p.turgor);
    const cx = p.x + bend * 0.2;
    const cy = p.gy - ht;
    const leaves: ReactNode[] = [];
    for (let t = 0.45; t <= 1.001; t += 0.09) {
      const bx = (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * cx + t * t * ex;
      const by = (1 - t) * (1 - t) * p.gy + 2 * (1 - t) * t * cy + t * t * ey;
      leaves.push(<circle key={`l${t}`} cx={bx - 3} cy={by + 1} r={2.5} fill={p.leaf} />);
      leaves.push(<circle key={`r${t}`} cx={bx + 3} cy={by + 1} r={2.5} fill={p.leaf} />);
    }
    out.push(
      <g key={i}>
        <path d={`M${p.x},${p.gy} Q${cx},${cy} ${ex},${ey}`} stroke={p.accent} strokeWidth={0.8} fill="none" />
        {leaves}
      </g>,
    );
  }
  return out;
}

const DRAW: Record<string, (p: PlantDraw) => ReactNode> = {
  fittonia,
  'creeping-fig': creepingFig,
  'baby-tears-pilea': babyTears,
  'spike-moss': spikeMoss,
  'cushion-moss': cushionMoss,
  'maidenhair-fern': maidenhair,
};
// Taller plants at the back, ground covers in front.
const DEPTH_ORDER = ['maidenhair-fern', 'fittonia', 'creeping-fig', 'spike-moss', 'baby-tears-pilea', 'cushion-moss'];

// ------------------------------------------------------------------ lids

function Lid({ vessel, lid }: { vessel: VesselId; lid: LidId }) {
  const glass = 'var(--jar-glass-fill)';
  const edge = 'var(--jar-glass-edge)';
  if (lid === 'open') return null;
  const tilt = lid === 'cracked';
  switch (vessel) {
    case 'jar':
      if (lid === 'cork') return <rect x={58} y={30} width={84} height={18} rx={3} fill="var(--jar-cork)" />;
      return (
        <g transform={tilt ? 'rotate(-7 146 40) translate(0 -6)' : undefined}>
          <rect x={50} y={36} width={100} height={8} rx={3} fill={glass} stroke={edge} strokeWidth={1.5} />
          <circle cx={100} cy={30} r={6} fill={glass} stroke={edge} strokeWidth={1.5} />
        </g>
      );
    case 'bottle':
      return (
        <g transform={tilt ? 'translate(0 -10)' : undefined}>
          <rect x={84} y={28} width={32} height={22} rx={3} fill="var(--jar-cork)" />
        </g>
      );
    case 'cloche':
      return <circle cx={100} cy={tilt ? 30 : 38} r={7} fill={glass} stroke={edge} strokeWidth={1.5} />;
    case 'bowl':
      return (
        <ellipse cx={100} cy={86} rx={44} ry={5} fill={glass} stroke={edge} strokeWidth={1.5}
          transform={tilt ? 'rotate(-10 140 86) translate(0 -5)' : undefined} />
      );
    case 'cube':
      return <rect x={tilt ? 40 : 22} y={50} width={156} height={8} rx={2} fill={glass} stroke={edge} strokeWidth={1.5} />;
    case 'wardian':
      return tilt ? <line x1={100} y1={48} x2={136} y2={70} stroke="var(--jar-frame)" strokeWidth={3} strokeLinecap="round" /> : null;
  }
}

// ------------------------------------------------------------------ the jar

export interface JarProps {
  spec: TerrariumSpec;
  state: TerrariumState;
  /** Show small animations (springtails hopping, gnats drifting). */
  lively?: boolean;
  className?: string;
  title?: string;
}

export function Jar({ spec, state, lively = false, className, title }: JarProps) {
  const uidRaw = useId();
  const uid = uidRaw.replace(/:/g, '');
  const v = VESSEL[spec.vessel];
  const g = geometry(state.container);
  const cl = state.climate;
  const sub = SUBSTRATES.find((s) => s.id === spec.substrate)!;

  const drainH = spec.drainage === 'none' ? 0 : 16;
  const subH = spec.depth === 'shallow' ? 24 : spec.depth === 'deep' ? 46 : 34;
  const gy = v.floorY - drainH - subH;
  const [gl, gr] = v.ground;

  const moisture = cl.moisture;
  const soil = mix(sub.color, '#1d140d', clamp((moisture - 0.3) / 0.9) * 0.65);
  const dry = clamp((0.45 - moisture) / 0.25);
  const reservoir = g.reservoirCapacityG > 0 ? state.pools.reservoirWaterG / g.reservoirCapacityG : 0;
  const cond = clamp(cl.condensationIndex * 1.3);
  const visibleMold = 0.1 * state.container.substrateL;
  const mold = clamp(state.pools.moldG / (2 * visibleMold));
  const litter = spec.hardscape.includes('leaf-litter') ? clamp(state.pools.detritusG / (state.container.substrateL * 9)) : 0;

  const rng = makeRng(hashSeed(spec.name + spec.seed));
  const plants = [...state.plants].sort((a, b) => DEPTH_ORDER.indexOf(a.speciesId) - DEPTH_ORDER.indexOf(b.speciesId));
  const slots = plants.map((pl, i) => {
    const r = makeRng(hashSeed(pl.id));
    const span = gr - gl - 30;
    const x = gl + 15 + (span * (i + 0.5)) / Math.max(1, plants.length) + (r() - 0.5) * 14;
    return { pl, x, r };
  });

  const droplets = (() => {
    const out: ReactNode[] = [];
    const r = makeRng(41);
    for (let i = 0; i < 70; i++) {
      const x = 20 + r() * 160;
      const y = 50 + r() * (gy - 60);
      out.push(<circle key={i} cx={x} cy={y} r={0.7 + r() * 1.7} />);
    }
    return out;
  })();

  const faunaDots: ReactNode[] = [];
  for (const f of state.fauna) {
    const pop = f.juveniles + f.adults;
    const r = makeRng(hashSeed(f.speciesId));
    if (f.speciesId === 'springtail') {
      const n = Math.min(40, Math.round(Math.log10(pop + 1) * 10));
      for (let i = 0; i < n; i++)
        faunaDots.push(
          <circle key={`s${i}`} className={lively && i % 3 === 0 ? 'hop' : undefined} style={{ animationDelay: `${r() * 4}s` }}
            cx={gl + 6 + r() * (gr - gl - 12)} cy={gy - 0.5 - r() * 2} r={1.05} fill="var(--jar-springtail)" />,
        );
    } else if (f.speciesId === 'dwarf-white-isopod') {
      const n = Math.min(10, Math.ceil(Math.log2(pop + 1) * 1.4));
      for (let i = 0; i < n; i++)
        faunaDots.push(<ellipse key={`d${i}`} cx={gl + 8 + r() * (gr - gl - 16)} cy={gy + 2 + r() * 8} rx={2.1} ry={1.2} fill="#eef0ea" opacity={0.9} />);
    } else if (f.speciesId === 'rough-woodlouse') {
      // Woodlice hide by day and come out at night.
      const n = Math.min(8, Math.ceil(pop / 2)) * (cl.lightOn ? 0.35 : 1);
      for (let i = 0; i < Math.round(n); i++) {
        const x = gl + 10 + r() * (gr - gl - 20);
        faunaDots.push(
          <g key={`w${i}`}>
            <ellipse cx={x} cy={gy - 2} rx={4.6} ry={2.5} fill="#5d6268" />
            <path d={`M${x - 2},${gy - 4.2} L${x - 2},${gy - 0.2} M${x},${gy - 4.5} L${x},${gy} M${x + 2},${gy - 4.2} L${x + 2},${gy - 0.2}`} stroke="#43474c" strokeWidth={0.5} />
          </g>,
        );
      }
    } else if (f.speciesId === 'fungus-gnat') {
      const n = Math.min(9, Math.ceil(pop / 12));
      for (let i = 0; i < n; i++)
        faunaDots.push(
          <circle key={`g${i}`} className={lively ? 'drift' : undefined} style={{ animationDelay: `${r() * 3}s` }}
            cx={gl + 10 + r() * (gr - gl - 20)} cy={gy - 20 - r() * 70} r={1.2} fill="#2a2a2a" />,
        );
    }
  }

  const moldBlobs: ReactNode[] = [];
  if (mold > 0.05) {
    const r = makeRng(9);
    const n = Math.ceil(mold * 7);
    for (let i = 0; i < n; i++)
      moldBlobs.push(<circle key={i} cx={gl + 10 + r() * (gr - gl - 20)} cy={gy - 1} r={4 + r() * 7 * mold} fill={`url(#mold-${uid})`} opacity={0.5 + 0.5 * mold} />);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={title ?? spec.name}>
      <defs>
        <clipPath id={`clip-${uid}`}>
          <path d={v.body} />
        </clipPath>
        <radialGradient id={`mold-${uid}`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="70%" stopColor="#f2f2ec" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`fog-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <pattern id={`leca-${uid}`} width="9" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4" r="3.6" fill={spec.drainage === 'gravel' ? '#8d918c' : '#a5633a'} />
        </pattern>
      </defs>

      {spec.vessel === 'cloche' && <rect x={18} y={250} width={164} height={16} rx={3} fill="var(--jar-wood)" />}
      {spec.vessel === 'wardian' && <rect x={18} y={262} width={164} height={12} rx={2} fill="var(--jar-wood)" />}

      <g clipPath={`url(#clip-${uid})`}>
        <rect x={0} y={0} width={W} height={H} fill="var(--jar-air)" />
        {/* drainage and water standing in it */}
        {drainH > 0 && (
          <>
            <rect x={0} y={v.floorY - drainH} width={W} height={drainH + 4} fill={`url(#leca-${uid})`} />
            <rect x={0} y={v.floorY - drainH * reservoir} width={W} height={drainH * reservoir + 4} fill="#5b8fa3" opacity={0.45} />
            <rect x={0} y={v.floorY - drainH - 1.5} width={W} height={1.5} fill="#2c2a27" opacity={0.6} />
          </>
        )}
        {/* substrate */}
        <path d={`M0,${gy + 2} Q50,${gy - 2} 100,${gy + 1} T200,${gy} L200,${v.floorY - drainH} L0,${v.floorY - drainH} Z`} fill={soil} />
        {state.waterloggedHours > 24 && <rect x={0} y={gy} width={W} height={3} fill="#7fb0c2" opacity={0.45} />}

        {/* hardscape behind plants */}
        {spec.hardscape.includes('wood') && (
          <path d={`M${gl + 6},${gy + 3} Q${gl + 40},${gy - 26} ${gl + 78},${gy - 40} L${gl + 82},${gy - 34} Q${gl + 46},${gy - 18} ${gl + 16},${gy + 4} Z`} fill="var(--jar-wood)" />
        )}
        {spec.hardscape.includes('stone') && (
          <path d={`M${gr - 46},${gy + 3} Q${gr - 44},${gy - 18} ${gr - 26},${gy - 20} Q${gr - 8},${gy - 18} ${gr - 6},${gy + 3} Z`} fill="#8f958f" />
        )}

        {slots.map(({ pl, x, r }) => {
          const sp = plantSpecies(pl.speciesId);
          const c = PLANT_COLORS[pl.speciesId] ?? { leaf: '#4c7a37', accent: '#3a5f2a' };
          const sick = Math.pow(1 - pl.health, 1.4);
          // The drawing is the same size for every vessel, so plants in a small jar are drawn larger.
          const k = Math.max(0.95, Math.min(2.3, 1.9 * Math.cbrt(6 / spec.sizeL)));
          const wall = x + ((x < 100 ? gl + 2 : gr - 2) - x) / k;
          return (
            <g key={pl.id} transform={`translate(${x} ${gy}) scale(${k}) translate(${-x} ${-gy})`}>
              {DRAW[pl.speciesId]?.({
                x, gy, rng: r, turgor: pl.turgor, health: pl.health, wall, dry,
                scale: Math.sqrt(clamp(pl.biomassG / sp.maxBiomassG)),
                leaf: mix(c.leaf, DYING, sick), accent: pl.speciesId === 'maidenhair-fern' ? c.accent : mix(c.accent, DYING, sick),
              })}
            </g>
          );
        })}

        {/* leaf litter thins as the crew eats it */}
        {Array.from({ length: Math.round(litter * 16) }, (_, i) => {
          const x = gl + 6 + rng() * (gr - gl - 12);
          return <ellipse key={i} cx={x} cy={gy - 0.5} rx={4} ry={1.4} fill={i % 2 ? '#8a5a2b' : '#a0703a'} transform={`rotate(${rng() * 40 - 20} ${x} ${gy})`} />;
        })}
        {moldBlobs}
        {faunaDots}

        {/* the film of water on the glass */}
        <rect x={0} y={0} width={W} height={gy} fill={`url(#fog-${uid})`} opacity={cond * 0.55} />
        <g fill="#ffffff" opacity={cond * 0.75}>{droplets}</g>
        {!cl.lightOn && <rect x={0} y={0} width={W} height={H} fill="var(--jar-night)" opacity={0.26} />}
      </g>

      {spec.vessel === 'wardian' && (
        <path d="M26,118 L174,118 M100,48 L100,264 M26,190 L174,190" stroke="var(--jar-frame)" strokeWidth={2.5} />
      )}
      <path d={v.outline ?? v.body} fill="none" stroke={spec.vessel === 'wardian' ? 'var(--jar-frame)' : 'var(--jar-glass-edge)'} strokeWidth={spec.vessel === 'wardian' ? 3 : 2} strokeLinejoin="round" />
      <path d={v.highlight} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
      <Lid vessel={spec.vessel} lid={spec.lid} />
    </svg>
  );
}

/** An empty vessel outline, used as the "add a terrarium" slot on the shelf. */
export function EmptyJar({ vessel = 'jar' as VesselId, icon = false }) {
  const v = VESSEL[vessel];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={v.outline ?? v.body} fill="none" stroke="currentColor" strokeWidth={icon ? 6 : 2}
        strokeDasharray={icon ? undefined : '5 6'} strokeLinejoin="round" />
      {!icon && <path d="M100,130 L100,190 M70,160 L130,160" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />}
    </svg>
  );
}
