/** Link previews for shared jars, served at /s/ID (see vercel.json). */
import { serve } from '../src/playground/server.js';

export const GET = serve(process.env);
