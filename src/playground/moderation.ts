/**
 * A first line of defence for public text: usernames, jar names, notes.
 * Catches common slurs and obvious profanity, including simple disguises
 * (l33t letters, spacing, repeated letters). It will not catch everything;
 * reports (three hide a jar) and removal from the Upstash console cover the rest.
 * Extend the lists rather than adding clever rules.
 */

/** Matched anywhere, even inside other words: long or unambiguous enough not to trip on innocent text. */
const ANYWHERE = [
  'nigger', 'nigga', 'faggot', 'tranny', 'wetback', 'raghead', 'beaner',
  'motherfuck', 'fuck', 'whore', 'slut', 'cocksuck', 'dickhead', 'bitch', 'bastard', 'nazi',
  'hitler', 'kkk', 'porn', 'hentai', 'molest', 'shit', 'asshole', 'wanker', 'twat', 'jizz', 'dildo',
];

/** Matched only as whole words, since they hide inside harmless ones (class, spice, grape, torpedo, Scunthorpe). */
const WHOLE_WORD = [
  'ass', 'cum', 'fag', 'dick', 'cock', 'tit', 'tits', 'sex', 'nsfw', 'xxx', 'coon', 'dyke', 'homo', 'jap', 'spic', 'kike',
  'chink', 'gook', 'rape', 'raped', 'rapist', 'pedo', 'pedophile', 'cunt', 'retard', 'retarded',
];

/** Usernames that would confuse people or impersonate the site. */
const RESERVED = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'support', 'help', 'staff', 'official', 'team', 'system', 'root',
  'terrarium', 'terrariums', 'playground', 'community', 'shelf', 'api', 'new', 'me', 'you', 'null', 'undefined', 'anonymous',
]);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g' };

/** Lowercase, undo l33t, collapse runs of the same letter. */
function normalise(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9!@$]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, '$1$1');
}

export function isOffensive(text: string): boolean {
  const tokens = normalise(text).split(/[^a-z]+/).filter(Boolean);
  // Rejoin words spelled out a letter at a time ("f u c k", "f.u.c.k"), but never glue
  // ordinary neighbouring words together, which would invent matches across them.
  const words: string[] = [];
  let run = '';
  for (const t of tokens) {
    if (t.length === 1) {
      run += t;
      continue;
    }
    if (run) words.push(run);
    run = '';
    words.push(t);
  }
  if (run) words.push(run);
  return words.some((w) => ANYWHERE.some((b) => w.includes(b)) || WHOLE_WORD.includes(w));
}

export const USERNAME = { min: 3, max: 20 } as const;

/** Why a username cannot be used, or null if it can. Names are stored lowercase. */
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME.min || name.length > USERNAME.max) return `Use ${USERNAME.min} to ${USERNAME.max} characters.`;
  if (!/^[a-z0-9_-]+$/.test(name)) return 'Use lowercase letters, numbers, hyphens and underscores only.';
  if (!/[a-z]/.test(name)) return 'Include at least one letter.';
  if (RESERVED.has(name)) return 'That name is reserved.';
  if (isOffensive(name)) return 'Pick a different name.';
  return null;
}
