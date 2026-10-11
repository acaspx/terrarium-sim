/** Vercel function for the playground. Storage: set KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN). */
import { handle, storeFromEnv } from '../src/playground/server.js';

const store = storeFromEnv(process.env);

export async function GET(request: Request) {
  return handle(request, await store);
}
export const POST = GET;
export const DELETE = GET;
