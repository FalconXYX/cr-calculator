/* The AI reader's server half: a Cloudflare Worker on the free plan.

   It exists for one reason — the model is reached through a Workers AI
   binding, which only a Worker has — and does as little as it can. The page
   sends the text of a stat block; this asks the model to annotate it and
   sends the annotation back. The prompt lives here rather than in the page,
   so the endpoint cannot be repurposed as a free general-purpose chatbot.

   The free plan has a daily allowance and simply refuses past it. That
   refusal is passed on as a 429 the page recognises, and the page falls back
   to its own reader until the allowance resets at midnight UTC. Nothing on
   this path can be billed: going over does not charge, it fails. */

import { AI_DEFAULT_MODEL, AI_MAX_INPUT, AI_PROMPT, AI_SCHEMA } from '../../src/lib/aiSchema.ts';

/** The one method of the Workers AI binding this needs. */
interface Ai {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  AI: Ai;
  /** Which model to ask. Set in wrangler.jsonc, so it can change without code. */
  MODEL?: string;
  /** Comma-separated origins allowed to call this. */
  ALLOWED_ORIGINS?: string;
}

export type Failure = 'quota' | 'busy' | 'failed';

/**
 * What went wrong, from Workers AI's error.
 *
 * 3036 is the daily allowance running out and lasts until midnight UTC, so
 * the page remembers it and stops asking. 3040 is the service being briefly
 * full, which is worth trying again in a minute and so is not remembered.
 */
export function classify(error: unknown): Failure {
  const text = error instanceof Error ? error.message : String(error);
  if (/\b3036\b|daily free allocation/i.test(text)) return 'quota';
  if (/\b3040\b|capacity temporarily exceeded/i.test(text)) return 'busy';
  return 'failed';
}

const STATUS: Record<Failure, number> = { quota: 429, busy: 503, failed: 502 };

function corsFor(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  /* Only the site's own pages. A browser enforces this; a script on somebody's
     laptop can lie about its origin, and the worst it can do with the lie is
     spend the day's allowance — which costs nothing and leaves everyone with
     the built-in reader until midnight. */
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const reply = (body: unknown, status: number, headers: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsFor(request, env);
  if (!cors) return new Response('Not allowed from this origin.', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'method' }, 405, cors);

  let text: unknown;
  try {
    ({ text } = (await request.json()) as { text?: unknown });
  } catch {
    return reply({ error: 'bad request' }, 400, cors);
  }
  if (typeof text !== 'string' || !text.trim()) return reply({ error: 'empty' }, 400, cors);
  if (text.length > AI_MAX_INPUT) return reply({ error: 'too long' }, 413, cors);

  try {
    const result = (await env.AI.run(env.MODEL || AI_DEFAULT_MODEL, {
      messages: [
        { role: 'system', content: AI_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: AI_SCHEMA },
      /* The default is 256, which cuts a block with more than a few entries
         off in the middle of its JSON. */
      max_tokens: 2000,
      /* Copying, not composing. */
      temperature: 0,
    })) as { response?: unknown } | null;

    const raw = result?.response;
    const extraction: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!extraction || typeof extraction !== 'object') {
      return reply({ error: 'failed' }, STATUS.failed, cors);
    }
    return reply({ extraction }, 200, cors);
  } catch (error) {
    const kind = classify(error);
    /* Visible in `npx wrangler tail`, which is the only place anybody will
       look when the reader seems to have stopped working. */
    console.error(`reader ${kind}:`, error instanceof Error ? error.message : error);
    return reply({ error: kind }, STATUS[kind], cors);
  }
}

export default { fetch: handle };
