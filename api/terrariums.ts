/** Vercel function for the playground. Storage: an Upstash Redis database; see storageConfig in src/playground/server.ts. */
import { handle, storageConfig, storeFromEnv } from '../src/playground/server.js';

const store = storeFromEnv(process.env);
const config = storageConfig(process.env);
const why = 'problem' in config ? config.problem : undefined;

export async function GET(request: Request) {
  return handle(request, await store, why);
}
export const POST = GET;
export const DELETE = GET;
