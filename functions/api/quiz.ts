import { fail, HttpError, json, parseJson } from '../_lib/http';
import { requestReadingQuiz, safetyIdentifier, validateQuizInput } from '../_lib/quiz';

interface QuizEnv {
  OPENAI_API_KEY?: string;
  QUIZ_CLIENT_RATE_LIMITER?: RateLimit;
  QUIZ_NETWORK_RATE_LIMITER?: RateLimit;
}

interface LocalLimit {
  count: number;
  resetAt: number;
}

const localLimits = new Map<string, LocalLimit>();
const CLIENT_ID_PATTERN = /^[a-z0-9-]{16,100}$/i;
// JSON escaping can use up to six transport bytes per decoded UTF-16 code unit.
// This still decodes to the 16,000-character source limit enforced below.
const MAX_QUIZ_REQUEST_BYTES = 110_000;

function useLocalLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const current = localLimits.get(key);
  if (!current || current.resetAt <= now) {
    if (localLimits.size > 500) {
      for (const [candidate, value] of localLimits) {
        if (value.resetAt <= now) localLimits.delete(candidate);
      }
    }
    localLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

async function withinLimits(env: QuizEnv, clientId: string, network: string): Promise<boolean> {
  if (env.QUIZ_CLIENT_RATE_LIMITER && env.QUIZ_NETWORK_RATE_LIMITER) {
    const [client, sharedNetwork] = await Promise.all([
      env.QUIZ_CLIENT_RATE_LIMITER.limit({ key: clientId }),
      env.QUIZ_NETWORK_RATE_LIMITER.limit({ key: network }),
    ]);
    return client.success && sharedNetwork.success;
  }
  return useLocalLimit(`client:${clientId}`, 4) && useLocalLimit(`network:${network}`, 20);
}

function isSameSiteRequest(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return origin === url.origin && (!fetchSite || fetchSite === 'same-origin');
}

export const onRequestGet: PagesFunction<QuizEnv> = async ({ env }) => {
  return json({ available: Boolean(env.OPENAI_API_KEY?.trim()) });
};

export const onRequestPost: PagesFunction<QuizEnv> = async ({ request, env }) => {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fail(404, 'Quiz generation is not available.');
  if (!isSameSiteRequest(request)) return fail(403, 'Quiz requests must come from speed-read.');

  const clientId = request.headers.get('x-speed-read-client')?.trim() ?? '';
  if (!CLIENT_ID_PATTERN.test(clientId)) return fail(400, 'This browser could not be identified. Refresh and try again.');

  const network = request.headers.get('cf-connecting-ip') || 'local';
  if (!await withinLimits(env, clientId, network)) {
    return json({ error: 'Quiz limit reached. Wait a minute and try again.' }, {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  try {
    const input = validateQuizInput(await parseJson<unknown>(request, MAX_QUIZ_REQUEST_BYTES));
    if (!input) return fail(422, 'The reading did not contain enough valid text for a quiz.');

    const quiz = await requestReadingQuiz(apiKey, input, await safetyIdentifier(`${clientId}:${network}`));
    return json(quiz);
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    const detail = error instanceof Error ? error.message : 'Unknown quiz error.';
    console.error('Quiz generation failed:', detail.replace(/sk-[a-z0-9_-]+/gi, '[redacted]'));
    return fail(502, 'The quiz could not be created right now. Try again.');
  }
};
