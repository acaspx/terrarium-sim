/**
 * What a shared terrarium is, and how anything arriving from the network is
 * checked before it is stored or drawn. Shared by the API and the app.
 *
 * A submission carries the design (spec) and the jar as it is now (state),
 * so the playground shows the real jar, care and all, not a re-simulation.
 * Both are rebuilt from trusted templates: only known options are accepted,
 * and the state keeps only the fields the engine itself would produce.
 */
import {
  buildTerrarium, CREW_COUNTS, CREW_IDS, DEPTHS, DRAINAGE, GROW_LIGHTS, HARDSCAPE, healthScore, LIDS, MOISTURES, PLACEMENTS,
  PLANT_IDS, PLANT_SIZES, ROOMS, SPECIES, SUBSTRATES, VESSELS,
  type TerrariumSpec, type TerrariumState,
} from '../engine/index.js';

export interface Submission {
  id: string;
  spec: TerrariumSpec;
  state: TerrariumState;
  day: number;
  score: number;
  author: string;
  note: string;
  createdAt: number;
  likes: number;
}

export interface SubmissionInput {
  spec: unknown;
  state: unknown;
  author?: unknown;
  note?: unknown;
}

export const LIMITS = { name: 40, author: 32, note: 200, plants: 8, maxDays: 365 * 5, events: 12 } as const;

export class InvalidSubmission extends Error {}

const fail = (msg: string): never => {
  throw new InvalidSubmission(msg);
};

/** Trim, drop control characters and collapse whitespace. */
export function cleanText(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return x.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A planting position: two finite numbers, held inside the floor. */
function position(x: unknown): [number, number] | undefined {
  if (!Array.isArray(x) || x.length !== 2) return undefined;
  const [u, v] = x.map(Number);
  if (!Number.isFinite(u) || !Number.isFinite(v)) return undefined;
  const c = (n: number) => Math.round(Math.max(-1, Math.min(1, n)) * 1000) / 1000;
  return [c(u!), c(v!)];
}

const oneOf = <T extends string>(x: unknown, ids: readonly T[], what: string): T =>
  ids.includes(x as T) ? (x as T) : fail(`Unknown ${what}.`);

export function validateSpec(x: unknown): TerrariumSpec {
  if (!x || typeof x !== 'object') fail('Missing design.');
  const o = x as Record<string, unknown>;
  const vessel = VESSELS.find((v) => v.id === o.vessel) ?? fail('Unknown vessel.');
  const sizeL = vessel.sizes.includes(o.sizeL as number) ? (o.sizeL as number) : fail('That size is not available for this vessel.');
  // Any known lid: recipes and care actions can put a lid on a vessel the builder would not offer it for.
  const lid = oneOf(o.lid, LIDS.map((l) => l.id), 'lid');
  const name = cleanText(o.name, LIMITS.name) || fail('Give the terrarium a name.');

  if (!Array.isArray(o.hardscape)) fail('Bad hardscape.');
  const hardscape = [...new Set((o.hardscape as unknown[]).map((h) => oneOf(h, HARDSCAPE.map((x) => x.id), 'hardscape')))];

  if (!Array.isArray(o.plants) || o.plants.length === 0 || o.plants.length > LIMITS.plants) fail('A shared terrarium needs one to eight plants.');
  const plants = (o.plants as Record<string, unknown>[]).map((p) => {
    const at = position(p?.at);
    return {
      speciesId: oneOf(p?.speciesId, PLANT_IDS, 'plant'),
      size: oneOf(p?.size, PLANT_SIZES.map((s) => s.id), 'plant size'),
      ...(at ? { at } : {}),
    };
  });

  if (!Array.isArray(o.fauna)) fail('Bad clean-up crew.');
  const seen = new Set<string>();
  const fauna = (o.fauna as Record<string, unknown>[]).flatMap((f) => {
    const speciesId = oneOf(f?.speciesId, CREW_IDS, 'animal');
    if (seen.has(speciesId)) return [];
    seen.add(speciesId);
    const count = Number(f?.count);
    if (count === 0) return [];
    return (CREW_COUNTS[speciesId] ?? []).includes(count) ? [{ speciesId, count }] : fail('Unusual crew size.');
  });

  const seed = Number(o.seed);
  return {
    name, vessel: vessel.id, sizeL, lid,
    drainage: oneOf(o.drainage, DRAINAGE.map((d) => d.id), 'drainage'),
    substrate: oneOf(o.substrate, SUBSTRATES.map((s) => s.id), 'substrate'),
    depth: oneOf(o.depth, DEPTHS.map((d) => d.id), 'depth'),
    hardscape, plants, fauna,
    placement: oneOf(o.placement, PLACEMENTS.map((p) => p.id), 'placement'),
    growLight: oneOf(o.growLight, GROW_LIGHTS.map((g) => g.id), 'grow light'),
    room: oneOf(o.room, ROOMS.map((r) => r.id), 'room'),
    startMoisture: oneOf(o.startMoisture, MOISTURES.map((m) => m.id), 'starting moisture'),
    seed: Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 1e9 : 1,
  };
}

/**
 * Copy `input` onto the shape of `template`: same keys, same types, finite numbers
 * of a sane size. Anything else falls back to the template's value.
 */
function conform<T>(template: T, input: unknown): T {
  if (typeof template === 'number') {
    const n = Number(input);
    return (typeof input === 'number' && Number.isFinite(n) && Math.abs(n) < 1e9 ? n : template) as T;
  }
  if (typeof template === 'boolean') return (typeof input === 'boolean' ? input : template) as T;
  if (typeof template === 'string') return (typeof input === 'string' ? input.slice(0, 64) : template) as T;
  if (template && typeof template === 'object' && !Array.isArray(template)) {
    const src = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) out[k] = conform(v, src[k]);
    return out as T;
  }
  return template;
}

const FAUNA_IDS = Object.values(SPECIES).filter((s) => s.kind === 'fauna').map((s) => s.id);

export function conformState(spec: TerrariumSpec, input: unknown): TerrariumState {
  const template = buildTerrarium(spec);
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const { plants: _p, fauna: _f, events: _e, ventRevert: _v, ...rest } = template;
  const state = conform(rest, src) as Omit<TerrariumState, 'plants' | 'fauna' | 'events' | 'ventRevert'>;
  state.hour = Math.max(0, Math.min(Math.trunc(state.hour), LIMITS.maxDays * 24));

  const plantShape = template.plants[0]!;
  const plants = (Array.isArray(src.plants) ? src.plants : []).slice(0, LIMITS.plants * 2).flatMap((p, i) => {
    const pl = conform(plantShape, p);
    if (!PLANT_IDS.includes(pl.speciesId)) return [];
    pl.id = cleanText(pl.id, 40) || `p${i}`;
    const at = position((p as { at?: unknown } | null)?.at);
    if (at) pl.at = at;
    else delete pl.at;
    pl.biomassG = Math.max(0, pl.biomassG);
    pl.health = Math.min(1, Math.max(0, pl.health));
    pl.turgor = Math.min(1, Math.max(0, pl.turgor));
    return [pl];
  });

  const faunaShape = { speciesId: '', eggs: 0, juveniles: 0, adults: 0 };
  const fauna = (Array.isArray(src.fauna) ? src.fauna : []).slice(0, FAUNA_IDS.length).flatMap((f) => {
    const fa = conform(faunaShape, f);
    if (!FAUNA_IDS.includes(fa.speciesId)) return [];
    fa.eggs = Math.max(0, Math.min(fa.eggs, 1e6));
    fa.juveniles = Math.max(0, Math.min(fa.juveniles, 1e6));
    fa.adults = Math.max(0, Math.min(fa.adults, 1e6));
    return [fa];
  });

  const events = (Array.isArray(src.events) ? src.events : []).slice(-LIMITS.events).flatMap((e) => {
    const ev = conform({ hour: 0, type: '', message: '' }, e);
    const message = cleanText(ev.message, 160);
    return message ? [{ hour: ev.hour, type: cleanText(ev.type, 24), message }] : [];
  });

  return { ...state, plants, fauna, events };
}

/** Check and normalise a submission. Throws InvalidSubmission with a message meant for people. */
export function prepareSubmission(input: SubmissionInput, id: string, now: number): Submission {
  const spec = validateSpec(input.spec);
  const state = conformState(spec, input.state);
  return {
    id, spec, state,
    day: Math.floor(state.hour / 24),
    score: healthScore(state),
    author: cleanText(input.author, LIMITS.author) || 'Anonymous keeper',
    note: cleanText(input.note, LIMITS.note),
    createdAt: now,
    likes: 0,
  };
}
