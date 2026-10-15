/** Dev-server wiring: Redis if configured, otherwise an in-memory community shelf with a few example keepers. */
import { buildTerrarium, frameDue, recordFrame, RECIPES, step, toFrame, type Frame, type TerrariumSpec } from '../engine/index.js';
import { prepareSubmission, type Submission } from './schema.js';
import { memoryStore, storeFromEnv, type Keeper } from './server.js';

export { handle, optionsFromEnv } from './server.js';

/** A jar lived for some days, recording weekly frames as the app does, then shared some days ago. */
function example(spec: TerrariumSpec, days: number, keeper: string, note: string, likes: number, i: number): Submission {
  const state = buildTerrarium(spec);
  let frames: Frame[] = [];
  for (let h = 0; h < days * 24 + 13; h++) {
    step(state);
    if (frameDue(state)) frames = recordFrame(frames, toFrame(state));
  }
  const sharedDaysAgo = 2 + i * 4;
  const sub = prepareSubmission({ spec, state, note, frames }, `example${i}`, Date.now() - sharedDaysAgo * 864e5, keeper);
  return { ...sub, likes };
}

/** Example keepers. Their recovery codes are unknown (the hash is a placeholder), so nobody can sign in as them. */
const KEEPERS: Keeper[] = ['mara', 'teo', 'june', 'sam', 'bottlegardener'].map((name, i) => ({
  name, createdAt: Date.now() - (30 - i) * 864e5, keyHash: 'example-keeper-no-sign-in',
}));

export function exampleSubmissions(): Submission[] {
  const r = (id: string) => structuredClone(RECIPES.find((x) => x.id === id)!.spec);
  return [
    example({ ...r('tropical-jar'), name: 'Kitchen jungle', seed: 21 }, 120, 'mara', 'Six months under a cheap LED. The fig found the glass in week five.', 14, 0),
    example({ ...r('mossy-woodland'), name: 'North light moss', seed: 8 }, 60, 'teo', '', 9, 1),
    example({ ...r('bottle-garden'), name: 'Message in a bottle', seed: 3 }, 200, 'bottlegardener', 'Sealed since spring. Never opened it.', 22, 2),
    example({ ...r('fern-cabinet'), name: 'Little Wardian', seed: 5 }, 90, 'june', 'Mushrooms came up on the log this week.', 5, 3),
    example({ ...r('tropical-jar'), vessel: 'bowl', sizeL: 3, lid: 'sealed', name: 'Desk bowl', seed: 5, hardscape: ['stone'], plants: [{ speciesId: 'baby-tears-pilea', size: 'small' }, { speciesId: 'cushion-moss', size: 'small' }], fauna: [{ speciesId: 'springtail', count: 50 }] }, 30, 'sam', 'Closed it after the first month of misting. Much happier.', 3, 4),
    example({ ...r('mossy-woodland'), name: 'Second moss study', seed: 13 }, 25, 'teo', 'Trying peat this time.', 2, 5),
  ];
}

export async function devStore(env: Record<string, string | undefined>) {
  return (await storeFromEnv(env)) ?? memoryStore({ keepers: KEEPERS, subs: exampleSubmissions() });
}
