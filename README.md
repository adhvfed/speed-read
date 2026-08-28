# WikiSpreed

A Wikipedia roulette for speed-reading practice. Roll a random English Wikipedia article, read it behind a stable line-by-line boundary, take a short recall quiz, see your score, and roll again. A public link or pasted text can still be used instead.

## How it works

- The primary action uses the MediaWiki Action API to choose one random, non-redirect article from English Wikipedia's main namespace, then prepares only its useful reading text.
- A short dice-roll transition runs while the article is chosen. Duplicate requests are blocked, and reduced-motion preferences are respected.
- Left and right arrows decrease or increase the target pace.
- A prepared or restored text stays fully covered behind its title and one large Start action.
- The countdown advances to the next line automatically at the selected pace.
- Up and down arrows move the active reading line manually and restart its countdown.
- The active line and two following lines form the only readable window. Clicking either look-ahead line makes it active; everything above and farther ahead remains behind opaque covers.
- Clicking a visible line or changing pace restarts the countdown for that line.
- Desktop paging happens only when the active line leaves its safe viewport band. Mobile remains touch-scrollable and jumps one usable page, without animation, only when the curtain reaches the screen edge.
- On mobile, the same four actions are available in a fixed thumb-control dock.
- When quiz generation is configured, finishing a read creates a four-question recall check with GPT-5.6 Luna. Quiz results are saved with the local session and can be reviewed after refresh.
- When pasted prose has no useful heading, Luna supplies a short title for the Start gate. Existing page titles are kept, and a failed or unavailable title request never blocks the read.
- The recall check presents one question at a time, then reveals the score and lets you play again at the same speed or choose a new one. The local stats view groups quiz accuracy by measured 100-wpm speed bands and keeps a chronological, source-linked article log.

Wikipedia selection follows [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette): each user action makes one serial GET request, includes an `Api-User-Agent` that identifies this repository, supplies `maxlag`, and presents load/rate-limit failures as a recoverable roll state. The app does not bulk-download, prefetch, or retry pages in parallel.

Prepared article bodies are stored only in this browser with IndexedDB. The local library is least-recently-used and bounded by all of: 100 articles, 50 MiB, 1% of the browser-reported storage quota, and reserved free-space headroom. Quota failures trigger one pruning retry; an article that still does not fit remains available only for the current read.

Completed-session summaries and the preferred pace remain small `localStorage` records. The URL hash identifies the saved article and semantic word position, so refreshing restores the same place and waits for Start. A missing or pruned hash falls back to New read. There are no accounts, analytics, server database, or cross-device sync. Clearing site data removes the local library and history.

The deployed site includes stateless Cloudflare Pages Functions. `/api/extract` downloads a public HTML page, removes navigation and other non-reading material, and returns useful plain text. `/api/title` optionally names untitled pasted prose, while `/api/quiz` is available only when an `OPENAI_API_KEY` secret exists; otherwise the client does not show a quiz. Both AI functions request `gpt-5.6-luna` with `store: false` and retain no article, title, or quiz data on the server.

The public AI boundaries share a private, service-bound Worker with two native Cloudflare limits: four requests per browser per minute and twenty per network per minute. The limiter has no public route and never receives the OpenAI key or article text. If that binding is absent or unhealthy, generation fails closed. Each Pages Function also requires a same-origin browser request, caps source and output size, supplies no model tools, treats source content as untrusted data, constrains output with a strict JSON schema, and validates the returned structure again on the server. The browser/network identity sent to OpenAI as a safety identifier is hashed first.

## Local development

Requires Node.js 22 or newer and [Service Federation](https://www.service-federation.com/).

```sh
fed start
```

`fed start` installs dependencies, builds the site, and starts the complete local Pages runtime plus its private rate-limit Worker as separate processes. Only the Pages process receives the linked development API key. It is declared as an optional manual secret and the committed Cloud binding uses `secret_cache: memory`, so AI features simply stay unavailable when no key exists and fetched values are not cached on disk.

Run a real, structure-only quiz smoke test through the running service:

```sh
fed run test:quiz
```

### Extraction heuristic research

Run the local Wikipedia-cleaning experiment through Service Federation:

```sh
fed run research:wikipedia-cleaning
```

The command samples two disjoint cohorts of 20 English Wikipedia articles. GPT-5.6 Luna labels the first cohort with `keep`, `delete`, or `reformulate` decisions and supplies bounded reformulations where needed; it labels the second cohort with only `keep` or `delete`. Article selection uses the Action API and analysis uses the canonical article HTML, matching the production extraction path. Wikipedia requests are serial, identified, compressed, and selection uses `maxlag`. Luna runs with strict structured output, no tools, and `store: false`.

Results are written incrementally beneath `.research/wikipedia-cleaning/<timestamp>/` as two JSONL datasets, an error log, and a manifest. The directory is ignored by Git. Public article excerpts and Luna judgments are stored there; the linked API key exists only in the research process environment and is never written to the result files.

For a two-article end-to-end check before a full run:

```sh
fed run research:wikipedia-cleaning-smoke
```

The follow-up cleaner evaluation is implemented in TypeScript. First prepare five deliberately varied articles for manual side-by-side inspection without making any Luna calls:

```sh
fed run research:wikipedia-cleaner-review
```

After reviewing those local `.original.txt`, `.cleaned.txt`, and `.audit.json` files, run a three-article Luna smoke evaluation and only then the 100-article evaluation:

```sh
fed run research:wikipedia-cleaner-evaluation-smoke
fed run research:wikipedia-cleaner-evaluation
```

The production regression command reruns six articles that exposed the original duplicate-fragment, coordinate, blockquote, and inline-text-boundary failures:

```sh
fed run research:wikipedia-cleaner-production-regression
```

The evaluator imports the same deterministic extractor used by the Cloudflare `/api/extract` function, so it judges the exact continuous-prose output delivered to the game rather than a research-only approximation. It gives Luna bounded original and cleaned versions and requires strict JSON containing `agrees`, `explanation`, and concrete `disagreements` with corrections. It writes an aggregate `summary.json` and readable `summary.md` beneath `.research/wikipedia-cleaner-evaluation/<timestamp>/`.

All Wikipedia and OpenAI calls are serial. Wikipedia requests use an identified client, gzip, GET, `maxlag=1`, and at least one second between requests. Both services receive at most two attempts for a transient request; repeated timeouts, throttling, or server errors halt the experiment instead of creating an unbounded retry/replacement loop. OpenAI `Retry-After` and remaining-capacity headers are honored, with a hard ceiling on automatic waits.

Run the test and production-build checks:

```sh
npm run check
npm run test:e2e -- --workers=1
```

The repository ignores `.env*` and `.dev.vars*`. Do not add an API key to either file, `fed.yaml`, Wrangler configuration, source, test fixtures, or shell history.

## Deployment

The Cloudflare Pages project is named `speed-read`; its custom domain is `wikispreed.com`.

Use a separately provisioned production key, not the Service Federation development vault. Add it as an encrypted Pages secret in **Workers & Pages → speed-read → Settings → Variables and Secrets**, or enter it interactively when Wrangler prompts:

```sh
npx wrangler pages secret put OPENAI_API_KEY --project-name speed-read
```

Then deploy:

```sh
npm run deploy
```

The deploy script publishes the private rate-limit Worker before the Pages project. Cloudflare preserves encrypted secrets across code deployments; the key can only be removed explicitly. If the production secret is absent or removed, the rest of WikiSpreed continues to work and the quiz path stays hidden.

The companion OpenTofu declaration lives in `~/Projects/static-sites-infra` so the Pages project and DNS mapping can be managed with the other static sites.
