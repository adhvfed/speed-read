import { fail, HttpError, json, parseJson } from '../_lib/http';
import { safetyIdentifier } from '../_lib/quiz';
import { requestReadingTitle, validateTitleInput } from '../_lib/title';

interface TitleEnv {
  OPENAI_API_KEY?: string;
  QUIZ_RATE_LIMITER?: Fetcher;
}

const CLIENT_ID_PATTERN = /^[a-z0-9-]{16,100}$/i;
const MAX_TITLE_REQUEST_BYTES = 42_000;

async function withinLimits(limiter: Fetcher, clientId: string, network: string): Promise<boolean> {
  const response = await limiter.fetch('https://quiz-rate-limit.internal/limit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, network }),
  });
  return response.status === 204;
}

function isSameSiteRequest(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return origin === url.origin && (!fetchSite || fetchSite === 'same-origin');
}

export const onRequestPost: PagesFunction<TitleEnv> = async ({ request, env }) => {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fail(404, 'Title generation is not available.');
  if (!env.QUIZ_RATE_LIMITER) return fail(503, 'Title generation is temporarily unavailable.');
  if (!isSameSiteRequest(request)) return fail(403, 'Title requests must come from speed-read.');

  const clientId = request.headers.get('x-speed-read-client')?.trim() ?? '';
  if (!CLIENT_ID_PATTERN.test(clientId)) return fail(400, 'This browser could not be identified. Refresh and try again.');

  const network = request.headers.get('cf-connecting-ip') || 'local';
  if (!await withinLimits(env.QUIZ_RATE_LIMITER, clientId, network)) {
    return json({ error: 'Title limit reached. Wait a minute and try again.' }, {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  try {
    const input = validateTitleInput(await parseJson<unknown>(request, MAX_TITLE_REQUEST_BYTES));
    if (!input) return fail(422, 'The reading did not contain enough valid text for a title.');
    return json(await requestReadingTitle(apiKey, input, await safetyIdentifier(`${clientId}:${network}`)));
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    const detail = error instanceof Error ? error.message : 'Unknown title error.';
    console.error('Title generation failed:', detail.replace(/sk-[a-z0-9_-]+/gi, '[redacted]'));
    return fail(502, 'A title could not be created right now.');
  }
};
