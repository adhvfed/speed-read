---
name: speed-read
description: A playful Wikipedia reading ritual that keeps the page still and the reader in control.
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

# Design System: speed-read

## Overview

**Creative North Star: "The Roll and the Reading Boundary"**

speed-read is a flat humanist instrument with one playful entrance and one exact reading mechanism. A die rolls to choose an English Wikipedia article; once it lands, an opaque curtain crosses the stable text one line at a time. A quiet utility column keeps measurement and reading controls separate from the reading field.

The product should feel curious without becoming noisy, and exact without becoming clinical. Geometry is clean, spacing is generous, and saturated color is reserved for the roll, active boundary, primary action, focus, and live countdown. It rejects casino decoration, literal rulers, paper props, brass hardware, bevels, gamified dashboards, account chrome, and book-themed nostalgia.

**Key Characteristics:**

- One flat cover plane and one cobalt reading edge.
- One authored dice-roll transition that carries the user from choice into focus.
- Stable, high-legibility text with a 65–72 character measure.
- A pale utility region that recedes beside the article.
- Measurement shown with tabular numerals, not decorative charts.
- Motion only for the dice roll, countdown, and direct state changes.

## Colors

The palette moves from daylight white through cool mineral neutrals to a deep blue curtain; clear cobalt is rare and operational.

### Primary

- **Cobalt Signal** (#0B63F6): active boundary, focus, primary action, and the live countdown segment.
- **Cobalt Deep** (#084BB8): hover and pressed states on cobalt actions.

### Neutral

- **Mineral Curtain** (#2B4055): fully obscures passed text and never carries readable article copy.
- **Cool Shell** (#EEF3F6): outer application ground and mobile control dock.
- **Quiet Utility** (#F7F9FA): desktop measurement and reading-control column.
- **Reading White** (#FFFDFC): article and input surfaces; deliberately cool, not book-paper cream.
- **Ink** (#16222D): primary type and icons.
- **Muted Ink** (#5D6D7C): secondary labels and metadata.
- **Hairline Rule** (#D8E0E6): structural divisions.

### Named Rules

**The Live Edge Rule.** Cobalt marks only what the reader can act on now. It does not decorate inactive surfaces.

**The Roll Rule.** The die is the only playful symbol. It is geometric, cobalt, and purposeful—not a casino motif repeated across the interface.

## Typography

**Display Font:** Atkinson Hyperlegible Next (with Arial fallback)
**Body Font:** Atkinson Hyperlegible Next (with Arial fallback)
**Label Font:** Atkinson Hyperlegible Next with tabular numerals

**Character:** One purpose-built legibility family keeps the interface contemporary and makes long reading, small labels, and measured numerals feel related. Hierarchy comes from size, weight, and space rather than a display/body costume change.

### Hierarchy

- **Display** (650, 2.25rem, 1.08): intake headline and empty-state orientation only.
- **Title** (650, 1.25rem, 1.2): article title and section headings.
- **Body** (400, 1.375rem desktop / 1.125rem mobile, 1.62): article content at 65–72 characters per line.
- **UI Body** (400–600, 0.9375–1rem, 1.4): forms and controls.
- **Label** (600, 0.8125rem, 0.025em): measurement labels; sentence case except abbreviations.

The complete interface ramp is 0.6875rem (micro), 0.75rem (caption), 0.8125rem (label), 0.875rem (small control), 0.9rem (compact UI), 1rem (UI), 1.0625rem (prominent UI), 1.125rem (mobile reader), 1.25rem (title), 1.5rem (subheading), 2rem (metric), 2.25rem (display), and 1.375rem (desktop reader). These sizes are functional stops rather than a continuously improvised scale.

**The Unbroken Line Rule.** Reader text sizes change only at structural breakpoints; controls never cause text to reflow during a session.

## Layout

Desktop reading uses a 15rem utility column and a flexible article region. The curtain belongs to the article region, while its boundary and countdown cross the gutter so the active line connects utility and text. The content column is capped at 72ch and centered within the remaining space.

At 760px and below, the utility column becomes a compact top status row and a fixed bottom control dock. The article keeps horizontal page padding of at least 20px, and all four reading controls remain reachable by thumb without covering the active line. Spacing follows a 4px base with 8, 12, 16, 24, 32, and 48px stops.

## Elevation & Depth

The system is flat. It uses no resting shadows, translucent glass, blur, texture, or fake material. Depth is conveyed through opaque adjacent color fields, hairline divisions, and the curtain overlapping the article content without changing layout. Curtain movement is immediate so changing the active line neither animates layout nor briefly exposes passed text.

**The Flat Evidence Rule.** A surface may change tone or expose a hairline for state; it does not lift to appear interactive.

## Shapes

Large layout planes are square. Standard controls use 6px corners for comfort and focus visibility; secondary panels may use 12px only when they genuinely group a temporary state. The countdown ring is the only recurring circular form, making its position meaningful.

## Components

### Buttons

- **Shape:** compact rectangle with 6px corners.
- **Primary:** cobalt with Reading White text; 12px × 18px padding.
- **Hover / Focus:** deepen to Cobalt Deep; a 2px cobalt focus outline with 2px offset remains visible.
- **Quiet:** transparent until hover, then Cool Shell; active states use color plus weight, never color alone.

### Inputs / Fields

- **Style:** Reading White field, 1px Hairline Rule, 6px corners, 14px × 16px padding.
- **Focus:** Ink border plus a 2px Cobalt Signal outline.
- **Error / Disabled:** error copy explains recovery; disabled state retains legible text and reduces contrast only on nonessential decoration.

### Navigation

The wordmark and local-storage note sit at opposite ends of the utility region. Reading-session navigation is separate from site navigation. On mobile, progress stays in the top app bar and never enters the bottom reading controls.

### Reading Curtain

The curtain is an opaque Mineral Curtain plane whose lower edge aligns immediately above the active line. Moving it changes only its height and never changes article geometry. Passed text must be fully unreadable. The viewport stays fixed while the line remains in its safe band; threshold crossings use an immediate page adjustment, with mobile paging by one usable screen only after the curtain reaches the dock.

### Countdown Marker

Two SVG circles share one center: a quiet limit track and a cobalt meter whose dash offset reflects remaining line time. It sits in the gutter left of the active line. The marker restarts when pace or active line changes; completing it advances only the reading boundary to the next stable line.

### Start State

Prepared, restored, and rerun texts begin stopped. The full meter, active line, pace, and explicit Start action are visible before timing begins. This state uses the same reading composition rather than introducing an overlay.

### Wikipedia Roll

The primary intake action is a broad cobalt field with a single die. Activating it leads to a full-workspace transition: the die tumbles while the MediaWiki selection is in flight, then the chosen title appears while useful text is extracted. Reduced-motion users see the die change face without spatial tumbling. The transition never launches more than one roll request at a time.

### Recall Check and Score

The post-reading quiz is a flat continuation of the instrument, not a gamified results screen. Four numbered fieldsets form one uninterrupted column with hairline divisions. Choices use native radio controls; after submission, a narrow success or error rule and explicit text identify the correct and selected answers. The result is one tabular measurement beside the heading, paired with a clear next-roll action. Loading uses the same quiet line pulse as extraction, and failure always confirms that the completed read was saved.

### Stats and Article Log

Accuracy-by-speed uses horizontal table rows rather than decorative charts: each measured-speed band shows percent correct, correct/total questions, and number of quizzes. The article log is chronological and links Wikipedia titles back to their source. Missing quiz scores remain visibly unscored rather than being treated as zero.

## Do's and Don'ts

### Do:

- **Do** make the current line, curtain edge, and countdown read as one interaction.
- **Do** keep article text between 65 and 72 characters per line on desktop.
- **Do** preserve keyboard, touch, focus, and reduced-motion behavior as first-class states.
- **Do** keep measurement secondary to reading.
- **Do** make quiz correctness understandable without relying on color, and keep explanations grounded and concise.
- **Do** make the roll feel like one small moment of anticipation and make another roll easy after scoring.

### Don't:

- **Don't** continuously auto-scroll, reflow, or move article geometry; viewport paging is reserved for boundary threshold crossings.
- **Don't** let covered text remain readable through opacity, blur, or texture.
- **Don't** use literal instrument hardware, paper nostalgia, pills, gradients, glass, or decorative dashboards.
- **Don't** use cobalt on inactive decoration.
- **Don't** turn the roll into casino chrome or add streaks, confetti, badges, or normative comprehension labels to quiz results.
