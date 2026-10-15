/** Vercel function for the playground. Storage: an Upstash Redis database; see storageConfig in src/playground/server.ts. */
import { handle, optionsFromEnv, storeFromEnv } from '../src/playground/server.js';

const store = storeFromEnv(process.env);
const options = optionsFromEnv(process.env);

export async function GET(request: Request) {
  return handle(request, await store, options);
}
export const POST = GET;
export const DELETE = GET;
