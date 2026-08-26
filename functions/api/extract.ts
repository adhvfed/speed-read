import { extractUsefulArticle, fetchPublicHtml } from '../_lib/extract';
import { fail, json, parseJson } from '../_lib/http';

interface ExtractBody {
  url?: string;
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = await parseJson<ExtractBody>(request);
    const value = body.url?.trim();
    if (!value || value.length > 2_000) return fail(422, 'Enter a complete public link.');
    const { html, url } = await fetchPublicHtml(value);
    return json(extractUsefulArticle(html, url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'That page could not be prepared.';
    const status = /private|local network|complete public link|not a readable|enough useful/i.test(message) ? 422 : 502;
    return fail(status, message);
  }
};
