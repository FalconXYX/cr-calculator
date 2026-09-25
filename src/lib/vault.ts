/* The creatures that are not in the open reference document.

   The Monster Manual is Wizards of the Coast's, and the System Reference
   Document 5.2 — which is published under Creative Commons Attribution 4.0 —
   covers about two thirds of it. Those two thirds ship with the site. The
   rest are encrypted, and a password opens them.

   Encrypted rather than merely hidden, because a gate that only filtered the
   list would not be a gate at all: the blocks would still be sitting in the
   bundle for anyone who opened the network tab. What ships is ciphertext.

   What this is and is not: it keeps the material out of the hands of anyone
   who has not been told the password, which is the whole job. It is not proof
   against somebody determined, who has the ciphertext and can guess at a
   short password offline for as long as they like. PBKDF2 is set high enough
   to make each guess cost about half a second, and that is the most a
   password of this length can buy. */

import type { MonsterTemplate } from './catalog.ts';

/** What tools/build-bestiary.mjs writes out. Base64 throughout. */
export interface SealedTemplates {
  iterations: number;
  salt: string;
  iv: string;
  /** How many creatures are inside, so the UI can say so while locked. */
  count: number;
  data: string;
}

const STORAGE_KEY = 'cr-calc-bestiary-key';

let opened: readonly MonsterTemplate[] = [];
const listeners = new Set<() => void>();

/** Everything the password has opened, or nothing while it is locked. */
export const sealedTemplates = (): readonly MonsterTemplate[] => opened;

export const isUnlocked = (): boolean => opened.length > 0;

/** Told whenever the vault opens or closes, so a list can redraw. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const announce = (): void => { for (const l of listeners) l(); };

const fromBase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(password: string, sealed: SealedTemplates): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(sealed.salt) as BufferSource,
      iterations: sealed.iterations,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

/**
 * Open the vault, or say plainly that the password was wrong.
 *
 * There is no hash to compare against and none is needed: AES-GCM carries an
 * authentication tag, so a key built from the wrong password fails to decrypt
 * rather than producing plausible rubbish.
 *
 * What comes out is gzipped. Encryption destroys the repetition that makes
 * stat block prose compress, so it is packed before the cipher rather than
 * left to the server, which would have nothing to work with.
 */
export async function open(
  password: string, sealed: SealedTemplates,
): Promise<readonly MonsterTemplate[] | null> {
  try {
    const key = await keyFrom(password, sealed);
    const packed = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) as BufferSource },
      key,
      fromBase64(sealed.data) as BufferSource,
    );
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text()) as MonsterTemplate[];
  } catch {
    return null;
  }
}

/** Fetched only when someone tries a password, so a locked visit never sees it. */
const loadSealed = (): Promise<SealedTemplates> =>
  import('../data/monsterTemplatesSealed.ts').then((m) => m.SEALED_TEMPLATES);

export async function unlock(password: string, remember = true): Promise<number> {
  const sealed = await loadSealed();
  const list = await open(password, sealed);
  if (!list) throw new Error('That is not the password.');
  opened = list;
  if (remember) {
    try { localStorage.setItem(STORAGE_KEY, password); } catch { /* private window */ }
  }
  announce();
  return list.length;
}

export function lock(): void {
  opened = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private window */ }
  announce();
}

/** Re-open on a later visit, quietly, from what the browser remembered. */
export async function restore(): Promise<void> {
  let password: string | null = null;
  try { password = localStorage.getItem(STORAGE_KEY); } catch { return; }
  if (!password) return;
  try { await unlock(password, false); } catch { lock(); }
}

/** How many are behind the password, without opening it. */
export const sealedCount = (): Promise<number> => loadSealed().then((s) => s.count);
