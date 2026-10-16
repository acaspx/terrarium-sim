/** Vercel function for keepers (usernames). Storage: see api/terrariums.ts. */
import { serve } from '../src/playground/server.js';

export const GET = serve(process.env);
export const POST = GET;
