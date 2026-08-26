import { fail, HttpError, json, parseJson } from '../_lib/http';
import { requestReadingQuiz, safetyIdentifier, validateQuizInput } from '../_lib/quiz';

interface QuizEnv {
  OPENAI_API_KEY?: string;
  QUIZ_RATE_LIMITER?: Fetcher;
}

const CLIENT_ID_PATTERN = /^[a-z0-9-]{16,100}$/i;
// JSON escaping can use up to six transport bytes per decoded UTF-16 code unit.
// This still decodes to the 16,000-character source limit enforced below.
const MAX_QUIZ_REQUEST_BYTES = 110_000;

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

export const onRequestGet: PagesFunction<QuizEnv> = async ({ env }) => {
  return json({ available: Boolean(env.OPENAI_API_KEY?.trim() && env.QUIZ_RATE_LIMITER) });
};

export const onRequestPost: PagesFunction<QuizEnv> = async ({ request, env }) => {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fail(404, 'Quiz generation is not available.');
  if (!env.QUIZ_RATE_LIMITER) return fail(503, 'Quiz generation is temporarily unavailable.');
  if (!isSameSiteRequest(request)) return fail(403, 'Quiz requests must come from speed-read.');

  const clientId = request.headers.get('x-speed-read-client')?.trim() ?? '';
  if (!CLIENT_ID_PATTERN.test(clientId)) return fail(400, 'This browser could not be identified. Refresh and try again.');

  const network = request.headers.get('cf-connecting-ip') || 'local';
  if (!await withinLimits(env.QUIZ_RATE_LIMITER, clientId, network)) {
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
