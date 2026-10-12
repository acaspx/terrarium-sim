/** Vercel function for keepers (usernames). Storage: see api/terrariums.ts. */
import { handle, storeFromEnv } from '../src/playground/server.js';

const store = storeFromEnv(process.env);

export async function GET(request: Request) {
  return handle(request, await store);
}
export const POST = GET;
