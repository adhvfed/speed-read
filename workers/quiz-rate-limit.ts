interface RateLimitEnv {
  QUIZ_CLIENT_RATE_LIMITER: RateLimit;
  QUIZ_NETWORK_RATE_LIMITER: RateLimit;
}

const KEY_PATTERN = /^[a-z0-9:._-]{1,160}$/i;

export default {
  async fetch(request: Request, env: RateLimitEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return new Response(null, { status: 204 });
    if (request.method !== 'POST' || url.pathname !== '/limit') return new Response(null, { status: 404 });

    let body: { clientId?: unknown; network?: unknown };
    try {
      body = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    const clientId = typeof body.clientId === 'string' ? body.clientId : '';
    const network = typeof body.network === 'string' ? body.network : '';
    if (!KEY_PATTERN.test(clientId) || !KEY_PATTERN.test(network)) return new Response(null, { status: 400 });

    const [client, sharedNetwork] = await Promise.all([
      env.QUIZ_CLIENT_RATE_LIMITER.limit({ key: clientId }),
      env.QUIZ_NETWORK_RATE_LIMITER.limit({ key: network }),
    ]);
    return new Response(null, { status: client.success && sharedNetwork.success ? 204 : 429 });
  },
};
