/* The far end of sync: one JSON file in your own Google Drive.

   No server of ours, and no database. Drive gives every application a hidden
   folder of its own — appDataFolder — which only that application can see and
   which does not appear anywhere in the Drive a person browses. A single file
   lives in it. Signing in on a second device reads that file and folds it
   into what is already there.

   That choice is worth stating, because the alternative was a database. A
   database would mean an account system, somewhere to run it, a row per
   person and a copy of everybody's monsters sitting on a disk we are
   responsible for. This way the data stays the user's: it is in their Drive,
   under their quota, and revoking the app's access in their Google settings
   is the whole of deleting it. The cost is that it is per-application rather
   than shareable, which for a shelf of private homebrew is not a cost.

   Tokens are kept in memory only, never in storage. An access token in
   localStorage is a bearer credential sitting where any script on the page
   can read it; losing one on a refresh is cheap by comparison. */

import { digest, emptySnapshot, reviveSnapshot } from './sync.ts';
import type { Snapshot } from './sync.ts';

/* ---------------- Google Identity Services, minimally typed ---------------- */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface Identity {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
}

declare global {
  interface Window { google?: Identity }
}

/* ---------------- Settings ---------------- */

/** Only the one scope. It cannot see, or ask for, anything else in a Drive. */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILENAME = 'cr-calc-sync.json';
const GSI = 'https://accounts.google.com/gsi/client';

const ID_KEY = 'cr-calc-google-client-id';

/**
 * The OAuth client ID, which is public by design — it identifies the app, it
 * does not authorise anything. Baked in at build time from the environment,
 * with a storage override so the whole flow can be tried against a new client
 * ID without a rebuild.
 */
export function clientId(): string {
  const baked = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (typeof baked === 'string' && baked.trim()) return baked.trim();
  try {
    const stored = localStorage.getItem(ID_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch { /* storage blocked; there is simply no override */ }
  return '';
}

/** False when nobody has configured a client ID, which hides the button. */
export const configured = (): boolean => clientId() !== '';

export interface Account {
  email: string;
  name: string;
}

/* ---------------- Loading the script ---------------- */

let loading: Promise<Identity> | null = null;

function loadIdentity(): Promise<Identity> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  /* Once. Two sign-in clicks in a row must not inject two script tags. */
  loading ??= new Promise<Identity>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = GSI;
    tag.async = true;
    tag.defer = true;
    tag.onload = () => {
      const api = window.google;
      if (api?.accounts?.oauth2) resolve(api);
      else reject(new Error('Google sign-in loaded but looks unfamiliar.'));
    };
    tag.onerror = () => {
      loading = null;
      reject(new Error('Could not reach Google sign-in.'));
    };
    document.head.appendChild(tag);
  });
  return loading;
}

/* ---------------- The token ---------------- */

interface Held {
  value: string;
  /** Milliseconds, already pulled back from the real expiry. */
  until: number;
}

let held: Held | null = null;
let client: TokenClient | null = null;
let pending: { ok: (token: string) => void; no: (error: Error) => void } | null = null;

/** Lets the caller know whether a token is in hand without asking Google. */
export const signedIn = (): boolean => held !== null && held.until > Date.now();

function settle(response: TokenResponse): void {
  const waiting = pending;
  pending = null;
  if (!waiting) return;
  if (response.access_token) {
    /* A minute off the clock, so a request started just under the wire does
       not arrive just over it. */
    const life = (response.expires_in ?? 3600) * 1000;
    held = { value: response.access_token, until: Date.now() + Math.max(0, life - 60_000) };
    waiting.ok(response.access_token);
    return;
  }
  waiting.no(new Error(response.error_description || response.error || 'Google declined the request.'));
}

async function tokenClient(): Promise<TokenClient> {
  const api = await loadIdentity();
  client ??= api.accounts.oauth2.initTokenClient({
    client_id: clientId(),
    scope: SCOPE,
    callback: settle,
    error_callback: (error) => {
      settle({
        error: error.type ?? 'unknown',
        error_description: error.type === 'popup_closed'
          ? 'Sign-in was closed before it finished.'
          : error.type === 'popup_failed_to_open'
            ? 'The sign-in window was blocked. Allow pop-ups for this site.'
            : error.message,
      });
    },
  });
  return client;
}

/**
 * A usable token.
 *
 * `interactive` is the difference between a button press and a page load. On
 * a page load the most Google will do without a prompt is hand back a token
 * for a grant that already exists; if it will not, that is not an error worth
 * showing anybody, it just means signed out.
 */
async function token(interactive: boolean): Promise<string> {
  if (held && held.until > Date.now()) return held.value;
  const c = await tokenClient();
  if (pending) throw new Error('Already waiting on Google sign-in.');
  return new Promise<string>((ok, no) => {
    pending = { ok, no };
    try {
      c.requestAccessToken(interactive ? {} : { prompt: '' });
    } catch (error) {
      pending = null;
      no(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/* ---------------- Talking to Drive ---------------- */

/** One request, retried once on a rejected token. */
async function call(path: string, init: RequestInit = {}, interactive = false): Promise<Response> {
  let bearer = await token(interactive);
  const send = () => fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${bearer}` },
  });

  let response = await send();
  if (response.status === 401 || response.status === 403) {
    /* The token we were holding has been revoked or has aged out early. Drop
       it and ask once more; a second refusal is a real one. */
    held = null;
    bearer = await token(interactive);
    response = await send();
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Drive said ${response.status}. ${body.slice(0, 200)}`.trim());
  }
  return response;
}

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

let fileId: string | null = null;

/** The id of our one file, or null if it has never been written. */
async function find(interactive: boolean): Promise<string | null> {
  if (fileId) return fileId;
  const query = encodeURIComponent(`name = '${FILENAME}' and trashed = false`);
  const response = await call(
    `${DRIVE}/files?spaces=appDataFolder&q=${query}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
    {}, interactive,
  );
  const body = await response.json() as { files?: { id?: string }[] };
  fileId = body.files?.[0]?.id ?? null;
  return fileId;
}

/**
 * Who is signed in.
 *
 * Asked of Drive rather than of an identity scope, so sync does not have to
 * request the right to read a profile just to put an address in a menu. A
 * failure here is cosmetic and swallowed.
 */
export async function whoAmI(): Promise<Account> {
  try {
    const response = await call(`${DRIVE}/about?fields=user(emailAddress,displayName)`);
    const body = await response.json() as { user?: { emailAddress?: string; displayName?: string } };
    return { email: body.user?.emailAddress ?? '', name: body.user?.displayName ?? '' };
  } catch {
    return { email: '', name: '' };
  }
}

/** Ask for access. Pops Google's window. */
export async function connect(): Promise<Account> {
  await token(true);
  return whoAmI();
}

/** Pick up a grant made on an earlier visit, or report that there is none. */
export async function reconnect(): Promise<Account | null> {
  try {
    await token(false);
  } catch {
    return null;
  }
  return whoAmI();
}

export async function disconnect(): Promise<void> {
  const bearer = held?.value;
  held = null;
  client = null;
  fileId = null;
  pending = null;
  if (!bearer) return;
  try {
    const api = await loadIdentity();
    await new Promise<void>((done) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; done(); } };
      /* Revoking is a courtesy to the user, not a step we let them wait on. */
      window.setTimeout(finish, 2000);
      api.accounts.oauth2.revoke(bearer, finish);
    });
  } catch { /* already gone, as far as anyone here can tell */ }
}

/** What is up there, or an empty snapshot if nothing is. */
export async function pull(interactive = false): Promise<Snapshot> {
  const id = await find(interactive);
  if (!id) return emptySnapshot();
  const response = await call(`${DRIVE}/files/${id}?alt=media`, {}, interactive);
  const raw = await response.json().catch(() => null) as unknown;
  return reviveSnapshot(raw);
}

export async function push(snap: Snapshot): Promise<void> {
  const body = JSON.stringify(snap);
  const id = await find(false);

  if (id) {
    await call(`${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return;
  }

  /* First write. Metadata and contents go up together, which also places the
     file in the hidden folder — `parents` cannot be set by a later patch. */
  const boundary = 'crcalc-sync-boundary';
  const metadata = JSON.stringify({ name: FILENAME, parents: ['appDataFolder'] });
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    body,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const response = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  const made = await response.json() as { id?: string };
  fileId = made.id ?? null;
}

/**
 * One round trip: read, fold, write back if the fold changed anything.
 *
 * Pull before every push rather than only on connect. Two devices left open
 * both push, and a push that has not looked first is how one of them loses an
 * afternoon.
 */
export async function exchange(
  fold: (theirs: Snapshot) => Snapshot,
  interactive = false,
): Promise<Snapshot> {
  const theirs = await pull(interactive);
  const merged = fold(theirs);
  if (digest(merged) !== digest(theirs)) await push(merged);
  return merged;
}
