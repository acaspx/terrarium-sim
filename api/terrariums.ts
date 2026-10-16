/** Vercel function for the community shelf. Storage: any Redis; see storageConfig in src/playground/server.ts. */
import { serve } from '../src/playground/server.js';

export const GET = serve(process.env);
export const POST = GET;
export const DELETE = GET;
