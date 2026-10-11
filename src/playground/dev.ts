/** Dev-server wiring: Redis if configured, otherwise an in-memory gallery with a few examples. */
import { buildTerrarium, RECIPES, run, type TerrariumSpec } from '../engine/index.js';
import { prepareSubmission, type Submission } from './schema.js';
import { memoryStore, storeFromEnv } from './server.js';

export { handle } from './server.js';

function example(spec: TerrariumSpec, days: number, author: string, note: string, likes: number, i: number): Submission {
  const state = buildTerrarium(spec);
  run(state, days * 24 + 13);
  const sub = prepareSubmission({ spec, state, author, note }, `example${i}`, Date.now() - (i + 1) * 36e5 * 5);
  return { ...sub, likes };
}

export function exampleSubmissions(): Submission[] {
  const r = (id: string) => structuredClone(RECIPES.find((x) => x.id === id)!.spec);
  return [
    example({ ...r('tropical-jar'), name: 'Kitchen jungle', seed: 21 }, 120, 'Mara', 'Six months under a cheap LED. The fig found the glass in week five.', 14, 0),
    example({ ...r('mossy-woodland'), name: 'North light moss', seed: 8 }, 60, 'Teo', '', 9, 1),
    example({ ...r('bottle-garden'), name: 'Message in a bottle', seed: 3 }, 200, 'Anonymous keeper', 'Sealed since spring. Never opened it.', 22, 2),
    example({ ...r('tropical-jar'), vessel: 'wardian', sizeL: 25, lid: 'cracked', name: 'Little Wardian', seed: 12 }, 45, 'June', 'Victorian vibes.', 5, 3),
    example({ ...r('tropical-jar'), vessel: 'bowl', sizeL: 3, lid: 'sealed', name: 'Desk bowl', seed: 5, hardscape: ['stone'], plants: [{ speciesId: 'baby-tears-pilea', size: 'small' }, { speciesId: 'cushion-moss', size: 'small' }], fauna: [{ speciesId: 'springtail', count: 50 }] }, 30, 'Sam', 'Closed it after the first month of misting. Much happier.', 3, 4),
  ];
}

export async function devStore(env: Record<string, string | undefined>) {
  return (await storeFromEnv(env)) ?? memoryStore(exampleSubmissions());
}
