import type { TerrariumSpec, TerrariumState } from '../engine/index.js';

/** The picture chat apps and social sites show for a jar's link: its 3D still beside its name. */
const W = 1200;
const H = 630;
/** The server takes up to 200 000 characters of base64. */
const MAX = 195_000;

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Up to `max` lines that fit `width`, the last cut short with an ellipsis if needed. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  while (g.measureText(`${kept[max - 1]}…`).width > width) kept[max - 1] = kept[max - 1]!.slice(0, -1);
  kept[max - 1] += '…';
  return kept;
}

/** A JPEG data URL, or null when the jar cannot be drawn (no WebGL). */
export async function shareCard(id: string, spec: TerrariumSpec, state: TerrariumState, keeper: string, day: number): Promise<string | null> {
  const { renderStill } = await import('./three/stills.js');
  const still = await renderStill(`card:${id}`, spec, state);
  if (!still) return null;
  const [img] = await Promise.all([load(still), document.fonts?.ready]);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#eef2ef');
  bg.addColorStop(1, '#dfe7e2');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // The still is 300 x 420; stand it on a shelf at the left.
  const jh = 560;
  const jw = (jh * img.width) / img.height;
  g.fillStyle = '#b08a62';
  g.fillRect(40, 30 + jh - 8, jw + 80, 14);
  g.drawImage(img, 80, 30, jw, jh);

  const x = 80 + jw + 70;
  const width = W - x - 70;
  g.fillStyle = '#3e6a44';
  g.font = "600 30px 'IBM Plex Sans', system-ui, sans-serif";
  g.fillText('Terrarium', x, 150);
  g.fillStyle = '#18261f';
  g.font = "700 72px 'Bricolage Grotesque', system-ui, sans-serif";
  const lines = wrap(g, spec.name, width, 2);
  lines.forEach((l, i) => g.fillText(l, x, 245 + i * 82));
  g.fillStyle = '#4c5d54';
  g.font = "400 34px 'IBM Plex Sans', system-ui, sans-serif";
  g.fillText(`by @${keeper} · day ${day}`, x, 245 + lines.length * 82 + 30);
  g.fillText('A living jar on the community shelf', x, 520);

  for (const q of [0.85, 0.7, 0.55]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= MAX) return url;
  }
  return null;
}
