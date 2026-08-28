---
name: wikispreed
description: A Wikipedia speed-reading arcade game where the player bets a reading speed and a recall check settles it.
colors:
  cabinet: "#301063"
  cabinet-deep: "#190638"
  cabinet-raised: "#431C86"
  keyline: "#0B0320"
  marquee-yellow: "#FFD119"
  marquee-yellow-deep: "#B98C00"
  pop-red: "#FF3355"
  go-green: "#39E36B"
  paint-white: "#FFF4E2"
  paint-lilac: "#C0A8EC"
  screen: "#F7F1E1"
  screen-ink: "#1B1206"
  screen-dim: "#736247"
  screen-rule: "#D9CCAE"
  error-soft: "#FF8FA3"
  shade: "rgb(4 1 14 / 0.72)"
  shade-soft: "rgb(4 1 14 / 0.24)"
  lamp-cruise: "#4FE07A"
  lamp-brisk: "#28D8E0"
  lamp-quick: "#4DA6FF"
  lamp-sprint: "#FFC01F"
  lamp-blitz: "#FF8320"
  lamp-reckless: "#FF3B5C"
typography:
  marquee:
    fontFamily: "Archivo Variable, Arial Black, sans-serif"
    fontSize: "4rem"
    fontWeight: 900
    fontStretch: "118%"
    lineHeight: 0.88
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo Variable, Arial Black, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    fontStretch: "108%"
    lineHeight: 1
    letterSpacing: "-0.01em"
  readout:
    fontFamily: "Archivo Variable, Arial, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Literata Variable, Georgia, serif"
    fontSize: "1.3125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  plate:
    fontFamily: "Archivo Variable, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.1em"
  scale:
    marquee-xl: "6rem"
    marquee-lg: "5rem"
    marquee-md: "4rem"
    marquee-sm: "3rem"
    marquee-xs: "2.75rem"
    readout-xl: "2.5rem"
    readout-lg: "2.25rem"
    readout-md: "2.125rem"
    readout-sm: "2rem"
    title-xl: "1.875rem"
    title-lg: "1.75rem"
    title-md: "1.625rem"
    title-sm: "1.5rem"
    title-xs: "1.25rem"
    ui-xl: "1.125rem"
    ui-lg: "1.0625rem"
    ui-md: "1rem"
    ui-sm: "0.9375rem"
    ui-xs: "0.875rem"
    label-lg: "0.8125rem"
    label-md: "0.75rem"
    label-sm: "0.6875rem"
    label-xs: "0.625rem"
    label-2xs: "0.5625rem"
rounded:
  hard: "3px"
  panel: "8px"
  button: "10px"
  round: "999px"
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
    backgroundColor: "{colors.marquee-yellow}"
    textColor: "{colors.keyline}"
    rounded: "{rounded.button}"
    padding: "16px 26px"
    note: "Sits on a 5px solid keyline with a 6px hard drop of its own deep shade. Presses 6px down on active."
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.paint-white}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
    note: "3px keyline border, no drop. Fills cabinet-raised on hover."
---

# Design System: WikiSpreed

## Overview

**Creative North Star: "The Cabinet"**

WikiSpreed is an arcade machine that happens to be full of Wikipedia. The chrome
around the game is silkscreened cabinet art: flat saturated paint, hard black
keylines, marquee lettering with a hard offset shadow, chunky buttons that
physically travel when pressed, and lamps that are either lit or dark. The
article itself appears on a warm screen behind the bezel, set in book type,
because the one thing a cabinet must not do is make the text hard to read.

That split is the whole system. **Everything outside the screen shouts.
Everything on the screen is quiet.** It is also why the copy is short: a cabinet
does not explain itself, it lights up a word and waits for you to hit the
button.

**Key Characteristics:**

- One drenched grape-purple cabinet field, painted flat, never gradient-lit.
- Hard 3–5px keylines around every real object; hard offset shadows under every
  display word.
- Buttons are physical: a colour face over a deep side, pressed down on `:active`.
- State is a lamp. A thing is lit or it is dark; there is no in-between wash.
- Numbers are readouts, set in tabular Archivo at readout scale.
- The reading screen is warm paper inside a bezel, set in Literata.

## Colors

The scene is a dim room with a bright machine in it, so the cabinet is dark and
saturated and the screen is the lit thing. This is not a dark UI theme with an
accent; it is a painted object with a display in it.

### Cabinet

- **Cabinet** (#301063): the machine's body. The dominant field on every screen
  outside the reader, carrying 50–70% of the surface.
- **Cabinet Deep** (#190638): recessed wells, the inside of a slot, empty tracks.
- **Cabinet Raised** (#431C86): raised panels and hover states.
- **Keyline** (#0B0320): every hard border and every hard offset shadow. It is a
  line and a shadow colour, never a ground.
- **Paint White** (#FFF4E2) and **Paint Lilac** (#C0A8EC): type on the cabinet.
  Secondary type is tinted from the cabinet's own violet, never grey.

### Screen

- **Screen** (#F7F1E1) with **Screen Ink** (#1B1206), **Screen Dim** (#736247),
  **Screen Rule** (#D9CCAE). Scoped to the reader and the quiz, which redefine
  ink, muted, and rule to paper values.

### Signal

- **Marquee Yellow** (#FFD119): the primary action, and only the primary action.
  If it is yellow, it is the thing to hit.
- **Pop Red** (#FF3355) and **Go Green** (#39E36B): failed and passed, wrong and
  right. Always paired with a word or a shape, never colour alone.

### The Lamp Ladder

The six speed tiers are a risk ladder and are lit like one: Cruise green, Brisk
cyan, Quick blue, Sprint yellow, Blitz orange, Reckless red. The tier a player
bets lights its own row, the stake button, the reading bezel, the countdown
ring, the HUD bar, and its bar in the record. Unselected tiers are unlit, which
means their colour is present at low intensity in the lamp only, not spread
across the row.

### Named Rules

**The Lit Rule.** Colour at full intensity means live. A tier that is not
selected, a lamp that is not earned, and a control that is not available are
unlit, and unlit means dark cabinet paint, not a faded tint of the colour.

**The Yellow Rule.** Marquee yellow is the primary action and nothing else. It
never decorates, never marks a heading, never fills a chart.

**The Quiet Screen Rule.** Nothing in the cabinet's vocabulary crosses onto the
reading screen: no keyline shadows on article text, no lamps in the margin, no
uppercase display type in the prose. The bezel is where the two worlds meet.

**The Honest Number Rule.** Every score on screen is arithmetic the player could
redo by hand. A readout is styled like a machine's readout; it is never inflated.

**The Lazy Copy Rule.** A cabinet lights up one word. Prefer the shortest
phrasing that still carries the meaning, prefer a number to a sentence, and
prefer a lit lamp to a number. Sentences that explain what the player is about
to see are cut, not shortened.

## Typography

**Display and UI:** Archivo Variable, run wide (`font-stretch` 104–118%) and
heavy (700–900) for marquee lettering, with tabular numerals on every readout.
Cabinet lettering is uppercase with tight tracking and a hard offset shadow in
keyline; that shadow is the world's native device and is not a stray glow.

**Reading:** Literata Variable, a face drawn for sustained screen reading, at
1.3125rem/1.6 on desktop. It also sets the quiz, because the quiz is still
reading.

### Hierarchy

- **Marquee** (900, wdth 118, up to 5rem, 0.88): the wordmark, screen titles,
  the big verdict words. Uppercase, offset-shadowed.
- **Readout** (800, tabular, 2.5–4rem): scores, wpm, multipliers. The number is
  the headline on any screen that has one.
- **Title** (800, wdth 108, 1.25–2.5rem): article titles and section heads.
  Article titles keep sentence case, because they are Wikipedia's words.
- **Body** (Literata 400, 1.3125rem desktop / 1.0625rem mobile, 1.6): article
  content at 65–72 characters per line.
- **Plate** (800, 0.75rem, 0.1em, uppercase): the small engraved labels
  silkscreened onto a cabinet — "LOCKED", "HIGH SCORE", "4/4 PAYS".

**The Unbroken Line Rule.** Reader text sizes change only at structural
breakpoints; nothing during a round causes the article to reflow.

**The Real Measure Rule.** The reading column is sized from the measured average
character width of the article's own text, not from the `ch` unit.

## Layout

Every screen outside the reader is a cabinet panel: a keylined field on the
cabinet ground, centred, with its own marquee head. The reader is a bezel with a
screen in it — a HUD strip across the top, the screen below, controls docked at
the bottom on mobile and in a side rail on desktop.

Desktop uses a 248px cabinet rail and a flexible play area. At 760px and below
the rail collapses into a top marquee bar and a fixed three-button dock, sized
so the bet screen's ladder and its start button both clear the fold. Spacing
follows a 4px base with 8, 12, 16, 24, 32, and 48px stops.

## Elevation & Depth

Two shadow languages, used for two different things.

- **Painted offset** (`Npx Npx 0 var(--keyline)`, no blur): display lettering,
  buttons, lamps, panels. This is silkscreen registration and it is hard-edged
  on purpose. Marquee words carry it as a `0.085em` text-shadow so the offset
  scales with the type.
- **Real lift** (offset plus blur, `--shade` at low alpha): things that sit above
  the cabinet in space — the tumbling die, the screen in its bezel, the curtain
  edge. Only these get blur.

One exception is documented rather than suppressed: the rail carries a 4px
keyline on its inner edge, which reads as an accent tab in the abstract but is
the black edging every painted cabinet panel actually has. It is a keyline
between two full-height fields, not a stripe on a card.

No glass, no backdrop blur, no gradient decoration. A gradient is permitted only
where a physical object has one: the bevel of a round button, the vignette
inside the bezel.

## Components

### The Roll Button

One round arcade button, 168px across, marquee yellow over a deep yellow side,
5px keyline, hard drop. It presses 6px down and its drop collapses to match. It
is the largest thing on the front door and nothing competes with it.

### The Lamp Ladder

Six named tiers from Cruise (200 wpm) to Reckless (750 wpm), one row each,
selectable by click or number key. Each row carries a lamp, the tier name, the
wpm readout, the payout multiplier at readout scale, the clock for this article,
and the player's own accuracy. The selected row lights: its lamp comes on, its
field takes the tier colour, and it gains a keyline and a hard drop. Unselected
rows are dark cabinet with an unlit lamp.

### The Bezel and the Curtain

The article sits on a warm screen inside a keylined bezel with an inner
vignette. Passed and future text is covered by cabinet paint — the same paint as
the machine, so the curtain reads as the machine's own shutter rather than as a
missing element. The active line and two look-ahead lines are the only readable
window, and the boundary carries the tier's lamp colour.

### The Countdown Ring

A chunky lit ring on the active line, in the tier colour, whose sweep drains
over the line's duration. Under reduced motion the sweep steps rather than
disappearing, because the boundary advances regardless.

### The HUD

The reader's top strip is a game HUD: locked speed as a readout, a segmented
energy bar for progress, and the clock remaining. Segments, not a smooth fill,
because a segmented bar is readable at a glance and a smooth one is a progress
ring in disguise.

### The Score Reel

Round score is set as individual digits in keylined wells, counting up on
reveal and static under reduced motion. The tally beneath it is the arithmetic:
base, clean-sweep bonus, streak bonus.

### The Record

Progress is a high-score board. The comprehension curve is one segmented bar per
tier in that tier's lamp colour; untested tiers show empty wells rather than a
zero-length bar. The round log is a score table with rank position, title, speed,
result and score.

## Do's and Don'ts

### Do:

- **Do** make the speed feel like a stake before the round and a constraint during it.
- **Do** show the player's own record at a tier at the moment they are choosing it.
- **Do** keep exactly the current line and two lines of look-ahead readable.
- **Do** keep article text between 65 and 72 characters per line on desktop.
- **Do** let a button travel when it is pressed.
- **Do** show every bonus as arithmetic the player can check.
- **Do** preserve keyboard, touch, focus, and reduced-motion behaviour as first-class states.
- **Do** make correctness and pass or fail readable without colour.

### Don't:

- **Don't** offer any way to change speed once a round has started.
- **Don't** continuously auto-scroll, reflow, or move article geometry.
- **Don't** expose article text before the round or let hidden lines stay clickable.
- **Don't** put cabinet devices on the reading screen.
- **Don't** compare the player to anyone else, or imply a normative reading speed.
- **Don't** let a failed round read as a punishment beyond the streak it costs.
- **Don't** write a sentence where a lit lamp would do.
