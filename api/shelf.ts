/**
 * The community shelf's one Vercel function. /api/terrariums, /api/keepers and /s/ID are
 * rewritten here (vercel.json); the handler routes by the address as it was asked for.
 * One function means one Redis connection per running instance, not one per route.
 * Storage: any Redis; see storageConfig in src/playground/server.ts.
 */
import { serve } from '../src/playground/server.js';

export const GET = serve(process.env);
export const POST = GET;
export const DELETE = GET;
