# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Speed-read is for people reading articles, essays, and pasted notes who want a quiet way to practice reading more deliberately and see whether their comfortable pace improves over time.

## Product Purpose

The app accepts a public link or pasted text, reduces it to useful reading content, and presents that content as a stable page. The reader chooses when to start, then a movable line focus and countdown marker advance the reading boundary at the chosen pace without reflowing the text. Success means the reader can complete real material at a self-chosen pace and understand their progress across sessions.

## Positioning

Unlike rapid-serial-word-presentation readers, speed-read never pulls or reflows text through a continuously moving viewport. The reader may scroll freely; the app pages only when the boundary would otherwise leave the usable screen.

## Operating Context

The product is a public website intended for a subdomain such as `speed-read.adhv.me`. It is used on desktop with arrow keys and on mobile with quiet, touch-friendly substitute controls. Readers may arrive with a URL or with text already copied to their clipboard.

## Capabilities and Constraints

- Import pasted text or a public HTTP(S) article URL.
- Remove navigation, advertising, comments, recommendations, and other non-reading matter from imported pages using explainable extraction heuristics.
- Preserve a stable document layout; advance only the selected reading boundary when its pace countdown completes.
- Avoid unnecessary viewport movement. On desktop, page only when the active line crosses a safe upper or lower band. On mobile, preserve touch scrolling until the curtain consumes the usable screen, then jump exactly one usable page without animation; page upward symmetrically when the active line leaves above.
- Obscure the text above the selected line so the reader cannot fall back and re-read it; moving the line changes the cover and, only at viewport thresholds, the scroll position—never document geometry.
- Move the selected line with Up/Down or touch controls and adjust target pace with Left/Right or touch controls.
- Let a reader select any visible line directly.
- Show an animated, non-distracting countdown marker beside the selected line; its completion advances the boundary, while manual line and pace changes restart it.
- Wait for an explicit Start after initial preparation, refresh, or rerun; hidden tabs pause and restart the current line's countdown when visible.
- Store prepared article bodies in a quota-aware, LRU-pruned IndexedDB library. Store only small session summaries and pace in localStorage. Restore saved content and word position from the URL hash; ignore hashes whose article has been pruned.
- Let completed sessions rerun their saved article when it is still present locally.
- After a completed read, optionally create a four-question comprehension check with GPT-5.6 Luna. Save the generated quiz and score only with the local session, restore it from its hash, and omit the entire flow when the server has no OpenAI secret.
- Keep quiz generation stateless and bounded: same-origin requests, per-browser and shared-network rate limits, a 16,000-character source ceiling, no model tools, strict structured output, server-side output validation, and an untrusted-source prompt boundary.
- Use no account, server database, or cross-device sync.
- Deploy through the owner's existing Cloudflare Pages infrastructure. URL extraction and optional quiz generation may use stateless Pages Functions; neither may persist fetched links or text.

## Brand Commitments

The product name is “speed-read”. Interface language should be plain, calm, and precise. Progress is evidence, not a competitive score; avoid gamified streak pressure.

## Evidence on Hand

No customer claims, benchmarks, testimonials, or product analytics exist yet and none should be fabricated. The sibling `riss` project and `static-sites-infra` repository provide established Cloudflare Pages deployment patterns.

## Product Principles

- The text stays put; the reader remains in control.
- Useful reading content should survive import while page furniture disappears.
- Controls stay available but recede while reading.
- Improvement is measured against the reader's own history.
- Pace is useful evidence only when paired with recall; the quiz is a quiet check, not a competitive score.
- The first useful reading session should require no account setup.

## Accessibility & Inclusion

All core reading actions must work by keyboard and by touch, focus must remain visible, and motion must respect reduced-motion preferences. Text contrast and control boundaries should meet WCAG AA.
