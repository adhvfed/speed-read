export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function parseJson<T>(request: Request, maxBytes = 50_000): Promise<T> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) throw new HttpError(400, 'Invalid Content-Length header.');
    if (length > maxBytes) throw new HttpError(413, 'Request is too large.');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large.');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The request body must be valid UTF-8 JSON.');
  }

  try {
    return JSON.parse(chunks.join('')) as T;
  } catch {
    throw new HttpError(400, 'The request body must be valid JSON.');
  }
}
