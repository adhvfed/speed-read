---
name: wikispreed
description: A Wikipedia speed-reading game where the player bets a reading speed and a recall check settles it.
colors:
  cobalt-signal: "#0B63F6"
  cobalt-deep: "#084BB8"
  curtain: "#2B4055"
  shell: "#EEF3F6"
  utility: "#F7F9FA"
  reading-field: "#FFFDFC"
  ink: "#16222D"
  muted-ink: "#5D6D7C"
  rule: "#D8E0E6"
  error: "#A83C35"
  success: "#2E7052"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, Arial, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Atkinson Hyperlegible Next, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1.62
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible Next, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.025em"
rounded:
  tight: "2px"
  control: "6px"
  panel: "12px"
spacing:
  hair: "4px"
  compact: "8px"
  control: "12px"
  group: "16px"
  section: "24px"
  region: "32px"
  field: "48px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-signal}"
    textColor: "{colors.reading-field}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  input:
    backgroundColor: "{colors.reading-field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "14px 16px"
---

# Design System: WikiSpreed

## Overview

**Creative North Star: "The Bet and the Boundary"**

WikiSpreed is a flat humanist instrument playing a game. A die rolls to choose an English Wikipedia article; the player stakes a reading speed on a ladder of six tiers; then an opaque curtain crosses the stable text one line at a time at exactly that speed, with no way to slow down. A recall check settles the bet and a scoreboard tallies what it paid.

The game feel comes from scale, tabular numerals, a score that counts up, and the tension of a locked clock. It does not come from new colour, confetti, badges, mascots, or casino chrome. The palette is unchanged from the reading instrument it grew out of, because the reading surface still has to be calm enough to read at 750 words per minute.

**Key Characteristics:**

- One flat cover plane and one cobalt reading edge.
- One authored dice-roll transition that carries the player from choice into the wager.
- A speed ladder that quotes its own odds, its own clock, and the player's own record.
- Stable, high-legibility text at a measured 65–72 character line.
- Scores shown as tabular arithmetic the player can check, not as decorative gauges.
- Motion only for the dice roll, the countdown, the score tally, and direct state changes.

## Colors

The palette moves from daylight white through cool mineral neutrals to a deep blue curtain; clear cobalt is rare and operational.

### Primary

- **Cobalt Signal** (#0B63F6): active boundary, focus, primary action, payout multipliers, progress fill, and the live countdown segment.
- **Cobalt Deep** (#084BB8): hover and pressed states, and earned bonuses in a score tally.

### Neutral

- **Mineral Curtain** (#2B4055): fully obscures passed text and never carries readable article copy.
- **Cool Shell** (#EEF3F6): outer application ground and mobile control dock.
- **Quiet Utility** (#F7F9FA): utility column, standing panels, and scoreboards.
- **Reading White** (#FFFDFC): article and panel surfaces; deliberately cool, not book-paper cream.
- **Ink** (#16222D): primary type and icons.
- **Muted Ink** (#5D6D7C): secondary labels and metadata.
- **Hairline Rule** (#D8E0E6): structural divisions and empty progress tracks.
- **Success** (#2E7052) and **Error** (#A83C35): correct and incorrect answers, passed and failed rounds. Both are always paired with words, never used alone.

### Named Rules

**The Live Edge Rule.** Cobalt marks only what the player can act on now, what they have earned, and how far they have come. It does not decorate inactive surfaces.

**The Roll Rule.** The die is the only playful symbol. It is geometric, cobalt, and purposeful, not a casino motif repeated across the interface.

**The Honest Number Rule.** Every score on screen is arithmetic the player could redo by hand. No number is inflated for effect and no bonus appears that the tally does not explain.

## Typography

**Display and Body Font:** Atkinson Hyperlegible Next (with Arial fallback), with tabular numerals for every measurement and score.

**Character:** One purpose-built legibility family keeps long reading, small labels, and large scores related. Hierarchy comes from size, weight, and space rather than a display costume.

### Hierarchy

- **Display** (680, up to 4.25rem, 0.99): the front-door question and screen titles only.
- **Article Title** (680, 2rem–3.5rem, stepping down as the title lengthens): the bet screen.
- **Round Score** (520, 2.5rem, tabular): the one number a scoreboard exists to show.
- **Body** (400, 1.375rem desktop / 1.125rem mobile, 1.62): article content at 65–72 characters per line.
- **UI Body** (400–650, 0.9375–1.0625rem, 1.4): controls, ladders, and tables.
- **Label** (650, 0.8125rem, 0.025em): measurement labels; sentence case except abbreviations.

**The Unbroken Line Rule.** Reader text sizes change only at structural breakpoints; nothing during a round causes the article to reflow.

**The Real Measure Rule.** The reading column is sized from the measured average character width of the article's own text, not from the `ch` unit, which is the width of a zero and sets roughly ninety-four characters where seventy is intended.

## Layout

Desktop reading uses a 240px utility column and a flexible article region, with the reading column capped at the measured 68-character width and centred in the remaining space. The curtain belongs to the article region while its boundary crosses the gutter, so the active line, the countdown, and the utility column read as one interaction.

At 760px and below, the utility column becomes a compact top status row and a fixed bottom control dock of three controls. Spacing follows a 4px base with 8, 12, 16, 24, 32, and 48px stops.

## Elevation & Depth

The system is flat. It uses no resting shadows, translucent glass, blur, texture, or fake material. Depth is conveyed through opaque adjacent colour fields, hairline divisions, and the curtain overlapping the article without changing layout.

## Components

### Roll Action

The front door is one broad cobalt field with a single die and one label. It is the largest interactive element on the page and there is no competing intake.

### Speed Ladder

Six named tiers from Cruise (200 wpm) to Reckless (750 wpm), one row each, selectable by click or by number key. Every row carries its payout multiplier, the estimated clock for this article, and the player's own accuracy at that tier, marked in error red once it falls below half. The selected row takes a cobalt left edge and a tinted ground. The ladder header quotes what a clean sweep at the selected tier pays, so the wager is a number before it is a feeling.

### Reading Curtain

Unchanged from the reading instrument. The window sits between two opaque Mineral Curtain planes; the active line and two look-ahead lines are the only visible text, with look-ahead lines set in a lighter ink so the eye anchors on the active line. Passed and farther-ahead text must be fully unreadable.

### Countdown Marker

Two SVG circles share one centre: a quiet limit track and a cobalt meter whose dash offset reflects remaining line time. Under reduced motion the sweep becomes stepped rather than disappearing, because the boundary still advances and the player still needs the warning.

### Committed Speed Panel

The reader's utility column states the locked speed, its tier, its multiplier, a progress track, and the time remaining. It offers no pace control, because there is none.

### Scoreboard

A flat panel with a cobalt top edge, or an error top edge on a failed round. It lists the round's arithmetic as a definition list — base pay, clean-sweep bonus, streak bonus — and closes with the round score, which counts up on reveal and appears immediately under reduced motion. A failed round explains in words why it failed.

### Rank Bar

Rank name, lifetime points, a cobalt progress track, and the points remaining to the next rank. It appears in the utility column, on the front door for a returning player, and beneath a finished round, so progress is visible at the moment it changes.

### Comprehension Curve

One row per speed tier with accuracy, sample size, and clean-sweep count. Untested tiers use a dashed track rather than an empty solid one, because a solid empty bar reads as zero rather than as no data. The highest reliably held tier is labelled.

## Do's and Don'ts

### Do:

- **Do** make the speed feel like a stake before the round and a constraint during it.
- **Do** show the player's own record at a tier at the moment they are choosing it.
- **Do** keep exactly the current line and two lines of look-ahead readable.
- **Do** keep article text between 65 and 72 characters per line on desktop.
- **Do** show every bonus as arithmetic the player can check.
- **Do** preserve keyboard, touch, focus, and reduced-motion behaviour as first-class states.
- **Do** make correctness and pass or fail readable without colour.

### Don't:

- **Don't** offer any way to change speed once a round has started.
- **Don't** continuously auto-scroll, reflow, or move article geometry.
- **Don't** expose article text before the round or let hidden lines stay clickable.
- **Don't** celebrate with confetti, badges, mascots, sound, or exclamation marks.
- **Don't** compare the player to anyone else, or imply a normative reading speed.
- **Don't** let a failed round read as a punishment beyond the streak it costs.
- **Don't** use cobalt on inactive decoration, or invent a colour outside the palette to signal excitement.
