export type InferredReadingSource =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'invalid'; message: string };

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function publicWebUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function inferReadingSource(value: string): InferredReadingSource {
  const trimmed = value.trim();
  if (!trimmed) return { kind: 'invalid', message: 'Paste a link or some text to begin.' };

  if (SCHEME.test(trimmed)) {
    const parsed = publicWebUrl(trimmed);
    if (!parsed) {
      return { kind: 'invalid', message: 'Use a public http or https link, or paste the text itself.' };
    }
    return { kind: 'url', url: parsed.toString() };
  }

  if (!/\s/.test(trimmed)) {
    const inferred = publicWebUrl(`https://${trimmed}`);
    if (inferred) return { kind: 'url', url: inferred.toString() };
  }

  return { kind: 'text', text: trimmed };
}
