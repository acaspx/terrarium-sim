import * as THREE from 'three';
import type { SubstrateId } from '../../engine/index.js';
import { fbm, hash2 } from './noise.js';

/**
 * Procedural textures, painted once on a canvas and cached. Nothing is
 * downloaded: the materials are made of the same randomness as the jar.
 */

const cache = new Map<string, THREE.CanvasTexture>();

function paint(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, color = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

function rng(seed: number) {
  let i = 0;
  return () => hash2(i++, seed, 991);
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
};

const SOIL_BASE: Record<SubstrateId, string> = {
  abg: '#4f3a29',
  bioactive: '#3f2e21',
  peat: '#5d422c',
  'potting-soil': '#352920',
};

/** The substrate, seen from above and through the glass. */
export function soilTexture(id: SubstrateId) {
  return paint(`soil-${id}`, 512, (ctx, n) => {
    const r = rng(id.length * 13 + 5);
    const base = SOIL_BASE[id];
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, n, n);
    // Fine grain.
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle = shade(base, (r() - 0.5) * 0.14);
      const s = 1 + r() * 2.2;
      ctx.fillRect(r() * n, r() * n, s, s);
    }
    const chip = (count: number, min: number, max: number, colors: string[]) => {
      for (let i = 0; i < count; i++) {
        ctx.save();
        ctx.translate(r() * n, r() * n);
        ctx.rotate(r() * Math.PI);
        ctx.fillStyle = colors[Math.floor(r() * colors.length)]!;
        const w = min + r() * (max - min);
        const h = w * (0.35 + r() * 0.4);
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2 + r() * 2);
        ctx.lineTo(w / 2, -h / 2);
        ctx.lineTo(w / 2 - r() * 3, h / 2);
        ctx.lineTo(-w / 2 + r() * 2, h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(-w / 2, -h / 2, w, 1.2);
        ctx.restore();
      }
    };
    const fibres = (count: number, len: number, colors: string[], width = 1) => {
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i++) {
        const x = r() * n;
        const y = r() * n;
        const a = r() * Math.PI * 2;
        const l = len * (0.5 + r());
        ctx.strokeStyle = colors[Math.floor(r() * colors.length)]!;
        ctx.lineWidth = width * (0.6 + r() * 0.8);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      }
    };
    if (id === 'abg') {
      chip(260, 9, 26, ['#7a5236', '#5e3f28', '#8b6440', '#6d4a30']);
      chip(90, 5, 12, ['#151312', '#1d1b19', '#262321']); // charcoal
      fibres(120, 10, ['#2c2018', '#3a2a1c']); // tree fern
    } else if (id === 'bioactive') {
      chip(140, 6, 15, ['#6a4830', '#563a26', '#7a5539']);
      fibres(420, 9, ['#7d5c3c', '#8d6a45', '#5b412b']); // coir
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = shade('#2a1f17', (r() - 0.5) * 0.06); // castings
        ctx.beginPath();
        ctx.arc(r() * n, r() * n, 1 + r() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === 'peat') {
      fibres(900, 14, ['#8d7a52', '#a08a5c', '#6f5a3a', '#7b6a44'], 1.3); // sphagnum strands
    } else {
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = r() < 0.8 ? '#e9e6dd' : '#cfcac0'; // perlite
        ctx.beginPath();
        ctx.ellipse(r() * n, r() * n, 2 + r() * 3, 1.5 + r() * 2.5, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      fibres(160, 6, ['#4a382b', '#2a201a']);
    }
  });
}

/** Weathered driftwood: grey-brown with long cracks along the grain. */
export function barkTexture() {
  return paint('bark', 512, (ctx, n) => {
    const r = rng(77);
    for (let y = 0; y < n; y++) {
      const v = fbm(0.5, y / 22, 3, 4);
      const c = new THREE.Color('#857360').offsetHSL(0, -0.02, (v - 0.5) * 0.18);
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(0, y, n, 1);
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const y = r() * n;
      const x = r() * n;
      const l = 40 + r() * 220;
      ctx.strokeStyle = r() < 0.7 ? 'rgba(40,30,22,0.55)' : 'rgba(210,200,185,0.35)';
      ctx.lineWidth = 0.8 + r() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + l * 0.33, y + (r() - 0.5) * 8, x + l * 0.66, y + (r() - 0.5) * 8, x + l, y + (r() - 0.5) * 6);
      ctx.stroke();
    }
  });
}

/** Cork: tan with dark lenticels. */
export function corkTexture() {
  return paint('cork', 256, (ctx, n) => {
    const r = rng(31);
    ctx.fillStyle = '#b88c5e';
    ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = shade('#b88c5e', (r() - 0.5) * 0.18);
      ctx.fillRect(r() * n, r() * n, 2, 2);
    }
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = 'rgba(70,45,25,0.6)';
      ctx.beginPath();
      ctx.ellipse(r() * n, r() * n, 1 + r() * 3, 0.6 + r() * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Planks for the shelf the jar stands on. */
export function shelfTexture() {
  return paint('shelf', 512, (ctx, n) => {
    const r = rng(5);
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const y0 = (p * n) / planks;
      const hue = (r() - 0.5) * 0.04;
      for (let y = 0; y < n / planks; y++) {
        for (let x = 0; x < n; x += 3) {
          const g = fbm(x / 90 + p * 9, (y + Math.sin(x / 45 + p) * 3) / 2.5, 11, 3);
          const c = new THREE.Color('#a07a52').offsetHSL(hue, 0, (g - 0.5) * 0.16);
          ctx.fillStyle = `#${c.getHexString()}`;
          ctx.fillRect(x, y0 + y, 3, 1);
        }
      }
      ctx.fillStyle = 'rgba(40,25,15,0.55)';
      ctx.fillRect(0, y0, n, 2);
    }
  });
}

/** Nerve plant leaf: deep green with a net of pale pink veins. */
export function fittoniaTexture() {
  return paint('fittonia', 256, (ctx, n) => {
    const r = rng(17);
    const g = ctx.createLinearGradient(0, n, 0, 0);
    g.addColorStop(0, '#1f4a2b');
    g.addColorStop(1, '#2d6038');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(243, 210, 219, 0.92)';
    ctx.lineCap = 'round';
    // Midrib and paired secondary veins.
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(n / 2, n);
    ctx.lineTo(n / 2, 6);
    ctx.stroke();
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 6; i++) {
      const y = n - 24 - i * 36;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(n / 2, y);
        ctx.quadraticCurveTo(n / 2 + s * 46, y - 26, n / 2 + s * 120, y - 64);
        ctx.stroke();
      }
    }
    // The fine net between them.
    ctx.lineWidth = 1.2;
    const pts: [number, number][] = [];
    for (let y = 8; y < n; y += 22) for (let x = 8; x < n; x += 22) pts.push([x + (r() - 0.5) * 14, y + (r() - 0.5) * 14]);
    for (const [x, y] of pts) {
      for (const [x2, y2] of pts) {
        const d = Math.hypot(x2 - x, y2 - y);
        if (d > 0 && d < 27 && r() < 0.5) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }
  });
}

/** A soft, hairy white puff for mold colonies. */
export function moldTexture() {
  return paint('mold', 256, (ctx, n) => {
    const r = rng(3);
    const c = n / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, 'rgba(245,245,238,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, n, n);
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2;
      const d0 = r() * c * 0.5;
      const l = 10 + r() * c * 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * d0, c + Math.sin(a) * d0);
      ctx.lineTo(c + Math.cos(a + (r() - 0.5) * 0.4) * (d0 + l), c + Math.sin(a + (r() - 0.5) * 0.4) * (d0 + l));
      ctx.stroke();
    }
  });
}

/** Grey-scale lumps, used as a bump map for stone and moss. */
export function lumpTexture() {
  return paint('lumps', 256, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // Tileable: sample a torus.
        const u = x / n;
        const v = y / n;
        const a = fbm(Math.cos(u * Math.PI * 2) * 3 + 9, Math.sin(u * Math.PI * 2) * 3 + Math.cos(v * Math.PI * 2) * 3, 4, 5);
        const b = fbm(Math.sin(v * Math.PI * 2) * 3 + 2, a * 4, 8, 3);
        const k = Math.round((a * 0.7 + b * 0.3) * 255);
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, false);
}

/** Bird's nest fern frond: pale enough to tint per leaf, with the dark midrib it is known for. */
export function strapLeafTexture() {
  return paint('strap-leaf', 128, (ctx, n) => {
    const g = ctx.createLinearGradient(0, 0, n, 0);
    g.addColorStop(0, '#d9e6cf');
    g.addColorStop(0.42, '#ffffff');
    g.addColorStop(0.58, '#ffffff');
    g.addColorStop(1, '#d9e6cf');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    for (let y = 4; y < n; y += 5) {
      ctx.beginPath();
      ctx.moveTo(n / 2, y + 6);
      ctx.lineTo(4, y);
      ctx.moveTo(n / 2, y + 6);
      ctx.lineTo(n - 4, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(n / 2 - 3, 0, 6, n);
  });
}

/** Isopod shell patterns, painted onto the body (the plates themselves are in the model). */
export function shellTexture(kind: 'dairy-cow' | 'magic-potion') {
  return paint(`shell-${kind}`, 128, (ctx, n) => {
    const r = rng(kind.length * 7);
    ctx.fillStyle = kind === 'dairy-cow' ? '#f2f0ea' : '#46526b';
    ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < (kind === 'dairy-cow' ? 9 : 90); i++) {
      const x = r() * n;
      const y = r() * n;
      ctx.fillStyle = kind === 'dairy-cow' ? '#1c1c1c' : r() < 0.6 ? '#e08a3c' : '#f1b25c';
      ctx.beginPath();
      if (kind === 'dairy-cow') ctx.ellipse(x, y, 8 + r() * 16, 6 + r() * 12, r() * 3, 0, Math.PI * 2);
      else ctx.arc(x, y, 1 + r() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export type DeadLeaf = 'oak' | 'beech' | 'willow';

/** How wide each leaf is along its length (0 at the stalk, 1 at the tip), as a share of the canvas. */
const LEAF_OUTLINE: Record<DeadLeaf, (v: number) => number> = {
  // Rounded lobes on an obovate blade.
  oak: (v) => 0.3 * Math.sin(Math.PI * Math.pow(v, 0.7)) * (0.72 + 0.28 * Math.max(0, Math.sin(v * Math.PI * 9 - 0.6))),
  // Smooth and oval, with a faintly toothed edge.
  beech: (v) => 0.3 * Math.sin(Math.PI * Math.pow(v, 0.85)) * (1 + 0.03 * Math.sin(v * 70)),
  // Long and narrow.
  willow: (v) => 0.13 * Math.sin(Math.PI * Math.pow(v, 0.9)),
};

/**
 * A fallen leaf, dry and part rotted: brown blade with paler veins, darker blotches and,
 * on the oak and willow, a few holes eaten through to the veins. Outside the leaf is
 * transparent, so the outline comes from the picture, not the mesh.
 */
export function deadLeafTexture(kind: DeadLeaf) {
  return paint(`dead-leaf-${kind}`, 256, (ctx, n) => {
    const r = rng(kind.length * 13 + 5);
    const outline = LEAF_OUTLINE[kind];
    const stalk = 0.12;
    // v runs up the canvas from the stalk (bottom) to the tip (top).
    const px = (u: number) => n / 2 + u * n;
    const py = (v: number) => n * (0.97 - v * 0.94);
    const blade = new Path2D();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const v = stalk + (1 - stalk) * (i / steps);
      const w = outline((v - stalk) / (1 - stalk));
      if (i === 0) blade.moveTo(px(0), py(v));
      blade.lineTo(px(-w), py(v));
    }
    for (let i = steps; i >= 0; i--) {
      const v = stalk + (1 - stalk) * (i / steps);
      blade.lineTo(px(outline((v - stalk) / (1 - stalk))), py(v));
    }
    blade.closePath();
    ctx.clearRect(0, 0, n, n);
    // The stalk.
    ctx.strokeStyle = '#4a3220';
    ctx.lineWidth = n * 0.014;
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    ctx.lineTo(px(0), py(stalk + 0.02));
    ctx.stroke();
    ctx.save();
    ctx.clip(blade);
    const g = ctx.createLinearGradient(0, py(0), 0, py(1));
    g.addColorStop(0, '#8a5a34');
    g.addColorStop(0.5, '#b47e48');
    g.addColorStop(1, '#9c683a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    // Blotches where it is rotting faster.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(52, 32, 18, ${0.12 + r() * 0.22})`;
      ctx.beginPath();
      ctx.ellipse(px((r() - 0.5) * 0.6), py(stalk + r() * 0.85), n * (0.01 + r() * 0.05), n * (0.01 + r() * 0.04), r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Veins: paler than the blade, as on a dry leaf. A midrib and paired side veins.
    ctx.strokeStyle = 'rgba(214, 178, 128, 0.75)';
    ctx.lineWidth = n * 0.008;
    ctx.beginPath();
    ctx.moveTo(px(0), py(stalk));
    ctx.lineTo(px(0), py(0.99));
    ctx.stroke();
    ctx.lineWidth = n * 0.004;
    const pairs = kind === 'willow' ? 12 : 8;
    for (let k = 1; k <= pairs; k++) {
      const v = stalk + (1 - stalk) * (k / (pairs + 1));
      const reach = outline((v - stalk) / (1 - stalk) + 0.06) * 0.95;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px(0), py(v));
        ctx.quadraticCurveTo(px(side * reach * 0.5), py(v + 0.03), px(side * reach), py(v + 0.09));
        ctx.stroke();
      }
    }
    ctx.restore();
    // Holes eaten through by the clean-up crew.
    if (kind !== 'beech') {
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(px((r() - 0.5) * 0.3), py(stalk + 0.2 + r() * 0.6), n * (0.006 + r() * 0.018), n * (0.006 + r() * 0.014), r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  });
}
