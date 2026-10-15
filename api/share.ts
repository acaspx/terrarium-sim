/** Link previews for shared jars, served at /s/ID (see vercel.json). */
import { handle, optionsFromEnv, storeFromEnv } from '../src/playground/server.js';

const store = storeFromEnv(process.env);
const options = optionsFromEnv(process.env);

export async function GET(request: Request) {
  return handle(request, await store, options);
}
