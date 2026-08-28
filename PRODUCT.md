# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

WikiSpreed is for curious people who want a short, repeatable game that pushes their reading speed and tells them honestly where their comprehension breaks.

## Product Purpose

WikiSpreed turns a random Wikipedia article into a wager. The player rolls an article, commits to a reading speed before seeing the text, reads it behind a boundary that advances on its own, and then answers four questions about it. The score rewards speed and accuracy together, so the interesting decision is always how hard to push. Success means the player keeps rolling and can see which speeds they still absorb.

## Positioning

Unlike rapid-serial-word-presentation trainers, WikiSpreed never pulls or reflows text through a moving viewport, and unlike untimed reading tools it does not let the player retreat to a slower pace once the round is under way. The speed is a bet, and the recall check settles it.

## Operating Context

The product is a public website. It is played on desktop with the keyboard and on mobile with a thumb-reachable control dock. Every session starts from a single roll action; there is no import, no library, and no other entry point.

## Capabilities and Constraints

- Roll one random, non-redirect English Wikipedia article from the main namespace through the MediaWiki Action API, using a descriptive client identifier, serial requests, `maxlag`, and load-aware error handling.
- Ask for a small number of candidates in one API call rather than repeating the call, because wikitext byte length predicts readable prose poorly and some articles are almost entirely tables.
- Remove navigation, infoboxes, tables, captions, citation markers, and reference sections from the article so the round is continuous prose.
- Cut a long article to a word budget so rounds stay comparable in length, and reject articles too thin to support a recall check.
- Present a speed ladder of six named tiers before the round. Each tier shows its payout multiplier, the estimated time for this article, and the player's own accuracy at that tier.
- Lock the committed speed for the duration of the round. The reader offers no pace control.
- Preserve a stable document layout; advance only the reading boundary when its pace countdown completes.
- Obscure the text above the active line and below the next two lines, so the active line plus two lines of look-ahead are the only readable window.
- Let the player step lines, pause, and abandon a round by keyboard or touch. Skipping is permitted and is punished by the recall check rather than by the interface.
- Generate a four-question recall check from the article after the round, score it, and save the result locally.
- Score a round as correct answers times committed speed, multiplied by 1.5 for a clean sweep and by a capped streak bonus. A round below three of four resets the streak but still pays its base.
- Track lifetime points, a rank ladder, current and best streak, best clean speed, and accuracy for each speed tier.
- Derive a comprehension curve from tier accuracy and name the highest tier the player holds reliably, requiring at least two rounds before claiming one.
- Store rounds in `localStorage` and prepared article bodies in a quota-aware, LRU-pruned IndexedDB library. Use no account, server database, or cross-device sync.
- Keep AI generation stateless and bounded: same-origin requests, per-browser and shared-network rate limits, no model tools, strict structured output, server-side output validation, and an untrusted-source prompt boundary.

## Brand Commitments

The product name is "WikiSpreed." Interface language should be plain, lively, and precise. It is a game and should feel like one, but the scoreboard is built from real numbers: no confetti, no badges, no fake celebration, and no leaderboards against other people. The player competes with their own ceiling.

## Evidence on Hand

No customer claims, benchmarks, testimonials, or product analytics exist yet and none should be fabricated. Reading-measure guidance follows ordinary typographic practice rather than a cited study.

## Product Principles

- The speed is a bet, and a bet you can back out of is not a bet.
- The text stays put; only the boundary moves.
- Score rewards speed and comprehension together, so neither alone wins.
- A failed round costs a streak, never the player's whole record.
- Improvement is measured against the player's own ceiling, never another player.
- The next roll is always one action away.
- The first round should require no account and no setup.

## Accessibility & Inclusion

All core actions must work by keyboard and by touch, focus must remain visible, and motion must respect reduced-motion preferences. The countdown must still report remaining time when motion is reduced, because the boundary advances regardless. Score outcomes must be readable without relying on colour. Text contrast and control boundaries should meet WCAG AA.
