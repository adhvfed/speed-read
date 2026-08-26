# speed-read

A quiet, line-by-line reading instrument. Import a public article or paste text, choose when to start, then move through it at your selected pace. The reading boundary advances automatically while the text itself never reflows.

## How it works

- Left and right arrows decrease or increase the target pace.
- A prepared or restored text waits for the reader to press Start.
- The countdown advances to the next line automatically at the selected pace.
- Up and down arrows move the active reading line manually and restart its countdown.
- Clicking any line makes it active.
- An opaque curtain hides text above the active line.
- Clicking any line or changing pace restarts the countdown for that line.
- Desktop paging happens only when the active line leaves its safe viewport band. Mobile remains touch-scrollable and jumps one usable page, without animation, only when the curtain reaches the screen edge.
- On mobile, the same four actions are available in a fixed thumb-control dock.
- When quiz generation is configured, finishing a read creates a four-question recall check with GPT-5.6 Luna. Quiz results are saved with the local session and can be reviewed after refresh.

Prepared article bodies are stored only in this browser with IndexedDB. The local library is least-recently-used and bounded by all of: 100 articles, 50 MiB, 1% of the browser-reported storage quota, and reserved free-space headroom. Quota failures trigger one pruning retry; an article that still does not fit remains available only for the current read.

Completed-session summaries and the preferred pace remain small `localStorage` records. The URL hash identifies the saved article and semantic word position, so refreshing restores the same place and waits for Start. A missing or pruned hash falls back to New read. There are no accounts, analytics, server database, or cross-device sync. Clearing site data removes the local library and history.

The deployed site includes stateless Cloudflare Pages Functions. `/api/extract` downloads a public HTML page, removes navigation and other non-reading material, and returns useful plain text. `/api/quiz` is available only when an `OPENAI_API_KEY` secret exists; otherwise the client does not show a quiz. The quiz function sends a bounded excerpt to the OpenAI Responses API only after the read is complete, requests `gpt-5.6-luna` with `store: false`, and retains no article or quiz data on the server.

The public quiz boundary calls a private, service-bound Worker with two native Cloudflare limits: four requests per browser per minute and twenty per network per minute. The limiter has no public route and never receives the OpenAI key or article text. If that binding is absent or unhealthy, quiz generation fails closed. The Pages Function also requires a same-origin browser request, caps source and output size, supplies no model tools, treats source content as untrusted data, constrains output with a strict JSON schema, and validates the returned structure again on the server. The browser/network identity sent to OpenAI as a safety identifier is hashed first.

## Local development

Requires Node.js 22 or newer and [Service Federation](https://www.service-federation.com/).

```sh
fed start
```

`fed start` installs dependencies, builds the site, and starts the complete local Pages runtime plus its private rate-limit Worker as separate processes. Only the Pages process receives the linked development API key. It is declared as an optional manual secret and the committed Cloud binding uses `secret_cache: memory`, so the quiz simply stays unavailable when no key exists and fetched values are not cached on disk.

Run a real, structure-only quiz smoke test through the running service:

```sh
fed test:quiz
```

Run the test and production-build checks:

```sh
npm run check
npm run test:e2e -- --workers=1
```

The repository ignores `.env*` and `.dev.vars*`. Do not add an API key to either file, `fed.yaml`, Wrangler configuration, source, test fixtures, or shell history.

## Deployment

The Cloudflare Pages project is named `speed-read`; its intended custom domain is `speed-read.adhv.me`.

Use a separately provisioned production key, not the Service Federation development vault. Add it as an encrypted Pages secret in **Workers & Pages → speed-read → Settings → Variables and Secrets**, or enter it interactively when Wrangler prompts:

```sh
npx wrangler pages secret put OPENAI_API_KEY --project-name speed-read
```

Then deploy:

```sh
npm run deploy
```

The deploy script publishes the private rate-limit Worker before the Pages project. Cloudflare preserves encrypted secrets across code deployments; the key can only be removed explicitly. If the production secret is absent or removed, the rest of speed-read continues to work and the quiz path stays hidden.

The companion OpenTofu declaration lives in `~/Projects/static-sites-infra` so the Pages project and DNS mapping can be managed with the other static sites.
