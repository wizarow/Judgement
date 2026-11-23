---
name: Judgement Notebook
description: The calling card game kept on the scorer's ruled notebook page. Call it. Make it. Win it.
colors:
  ink: "#1F3A9A"
  ink-soft: "rgba(31,58,154,.12)"
  red-pen: "#C2281C"
  highlighter: "rgba(255,214,0,.55)"
  sticky: "#FBE88A"
  sticky-ink: "#3A3110"
  page: "#F4F0E4"
  desk: "#DCD5C3"
  feint-rule: "#C3D3E8"
  margin-rule: "#E2A49C"
  graphite: "#2C2B28"
  pencil: "#66645E"
  card-face: "#FFFDF7"
  card-ink: "#1B1B1B"
  card-red: "#C0281C"
  card-edge: "#D8D0BC"
  black-page: "#18181B"
  black-desk: "#0E0E10"
  black-feint-rule: "#2A3142"
  black-margin-rule: "#5E2C2C"
  gel-ink: "#9DB8FF"
  gel-ink-soft: "rgba(157,184,255,.14)"
  gel-red: "#FF7A6B"
  chalk-graphite: "#ECE8DD"
  black-pencil: "#A4A29B"
  black-highlighter: "rgba(196,255,64,.22)"
  black-sticky: "#3D3820"
  black-sticky-ink: "#F4EBC0"
  black-card-face: "#F2EEE3"
  black-card-edge: "#3A3A40"
typography:
  display:
    fontFamily: "Kalam, Hind, system-ui, sans-serif"
    fontSize: "clamp(3rem, 15vw, 4.2rem)"
    fontWeight: 700
    lineHeight: "3.5rem"
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Kalam, Hind, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Kalam, Hind, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 700
    lineHeight: 1.1
  hand:
    fontFamily: "Kalam, Hind, system-ui, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 400
    lineHeight: "1.75rem"
  body:
    fontFamily: "Hind, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: "1.75rem"
  label:
    fontFamily: "Hind, system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 400
    lineHeight: 1.2
  card-index:
    fontFamily: "Hind, system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.03em"
rounded:
  drawn: "255px 14px 225px 14px / 14px 225px 14px 255px"
  card: "7px"
  sheet: "14px 14px 0 0"
  toast: "6px"
  round: "50%"
spacing:
  line: "1.75rem"
  half-line: "0.875rem"
  margin-gutter: "40px"
  edge-gutter: "16px"
  page-max: "480px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    typography: "{typography.title}"
    rounded: "{rounded.drawn}"
    padding: "0.35rem 1.1rem"
    height: "2.75rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.drawn}"
    padding: "0.35rem 1.1rem"
    height: "2.75rem"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.hand}"
    rounded: "{rounded.drawn}"
    padding: "0 0.8rem"
    height: "2.25rem"
  chip-selected:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.drawn}"
  call-number:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "2.75rem"
  call-number-hover:
    backgroundColor: "{colors.ink-soft}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "2.5rem"
  input-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0"
    height: "2.625rem"
  playing-card:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.card-ink}"
    typography: "{typography.card-index}"
    rounded: "{rounded.card}"
  sheet:
    backgroundColor: "{colors.page}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.sheet}"
    padding: "0.875rem 16px 1.75rem 40px"
  sticky-note:
    backgroundColor: "{colors.sticky}"
    textColor: "{colors.sticky-ink}"
    padding: "0.45rem 0.7rem 0.5rem"
---

# Design System: Judgement Notebook

## Overview

**Creative North Star: "The Scorer's Notebook"**

The whole game lives on one page of a feint-ruled notebook: the page the scorekeeper at a family table writes calls and totals on. The Screen (the running scoresheet) is the ground the table sits on, not a modal behind a button. Everything a scorer would write appears in blue ballpoint handwriting; everything a rulebook would print appears in plain print. Red pen strikes, corrects and marks the cut. Graphite pencil suggests. Real playing cards are dropped onto the page at slight, settled angles.

Density is that of a well-kept ledger: one ruled 28px line per player, numbers and tallies in the margins of names, a single handwritten status line. Nothing is boxed in a filled panel; emphasis arrives as a mark someone made on the paper: a highlighter swipe under the current turn, an ink loop around a made call or the winning card, a red strike through a missed one, a hand-drawn underline under a title. The second paper is black: a black-paper notebook written in gel ink, with the same cream cards dropped on it.

Motion is a pen at work. Marks draw themselves stroke by stroke; cards drop and settle; sheets slide up like a page being pulled from under the pad. Nothing fades in for its own sake.

**Key Characteristics:**
- Feint-ruled page on a 28px line grid with a double red margin rule at the left.
- Two hands: Kalam (ballpoint) for what a scorer writes, Hind (print) for instructions and labels.
- Blue ink is the voice of the player and of action; red pen is reserved for strikes, misses, the cut and warnings.
- Pen-stroke marks (loops, strikes, tallies, underlines, stars) drawn with stroke-dashoffset.
- Physical objects (cards, sticky notes, sheets) cast soft shadows; drawn marks never do.
- White paper and black paper themes, with cards that stay cream on both.

## Colors

A paper-and-pen palette: warm off-white page, one blue ink, one red pen, a graphite pencil, and a yellow highlighter, each redefined for black paper with gel-ink equivalents.

### Primary
- **Ballpoint Blue** (ink): every handwritten mark that matters: the title, calls, made-call loops, tallies, the player's own name, primary buttons (filled), chip and pad outlines, focus outlines, icons. Its soft tint (ink-soft) is the only fill a control takes: selected chips, pressed icon buttons, hovered call numbers, the timer track.

### Secondary
- **Red Pen** (red-pen): strikes through missed calls, the struck forbidden call, the cut tag on a trumping card, the red-suit cut symbol, the turn arrow, the title underline and "Win it." loop, game-over stars, the running-out timer, error text, unread badge.

### Tertiary
- **Highlighter Yellow** (highlighter): one swipe behind the name whose turn it is, and the current round's row on the Screen. Never a background for a region.
- **Sticky Note** (sticky / sticky-ink): incoming chat notes stuck to the page corner.

### Neutral
- **Notebook Page** (page): the writing surface; also the text colour on ink-filled buttons.
- **Desk** (desk): what the page sits on beyond 480px.
- **Feint Rule** (feint-rule): the blue horizontal rules every 28px; also scrollbar thumb and empty-slot dashes.
- **Margin Rule** (margin-rule): the double vertical margin line at 26px and 30px.
- **Graphite** (graphite): default handwritten and printed text for other players and totals; toast background.
- **Pencil** (pencil): printed labels, hints, bot tags, placeholders, the dotted call suggestion, future rows on the Screen.
- **Card Face / Card Ink / Card Red / Card Edge**: the physical card stock, black suits, red suits, and card border.

### Black paper
The black-paper theme swaps each role, it never inverts by formula: page to Black Page, desk to Black Desk, rules to Black Feint Rule and Black Margin Rule, ink to Gel Ink (with Gel Ink Soft), red to Gel Red, graphite to Chalk Graphite, pencil to Black Pencil, highlighter to a lime gel highlighter (black-highlighter), sticky to Black Sticky with Black Sticky Ink. Cards stay light (Black Card Face) with a darker edge (black-card-edge); card ink and card red do not change. Selected by the phone's dark preference unless the player picks "White paper"; "Black paper" forces it.

### Named Rules
**The Ink and Red Pen Rule.** Blue ink is the player's hand and every action; red pen only corrects, strikes, warns or marks the cut. Red never fills a primary control.

**The Same Cards Rule.** Cards are physical objects, not paper. They stay cream with black and red suits on both papers.

**The Suit Symbol Rule.** Red is never the only cue: every suit reference carries its symbol (spade, heart, club, diamond) in print.

## Typography

**Display / Handwriting Font:** Kalam (with Hind, system-ui)
**Print Font:** Hind (with system-ui)

**Character:** Kalam is a confident ballpoint scrawl that reads as one person's hand; Hind is a calm, open print face that reads as the rulebook. The pairing is the content model, not decoration.

### Hierarchy
- **Display** (Kalam 700, clamp(3rem, 15vw, 4.2rem), two lines of grid): the "Judgement" title on the home page. The game-over winner uses the same role at clamp(2.2rem, 11vw, 3.2rem).
- **Headline** (Kalam 700, 1.6rem, 1): sheet titles ("The Screen", "Table chat", "Menu"), the calling summary.
- **Title** (Kalam 700, 1.45rem, 1.1): the round number in the header; button labels run 1.15rem to 1.35rem in the same weight; call-pad numbers 1.45rem.
- **Hand** (Kalam 400, 1.05rem to 1.25rem, on the 28px line): player names, calls, totals, status line, chat, Screen cells, chip labels.
- **Body** (Hind 400, 0.95rem, 28px line, max 62ch): rules and sheet prose; sheet subheads use Hind 600 at the same size.
- **Label** (Hind 400 to 500, 0.78rem to 0.9rem, 1.2): field labels, hints, cut caption, round sub-caption, bot tags, superscript points.
- **Card index** (Hind 600, sized from card height at 17%, -0.03em): rank and suit on card corners; centre pip at 36% of card height.

Root size is player-adjustable: 15, 16, 17.5 or 19px. Every rem value, including the line grid, scales with it.

### Named Rules
**The Who Wrote It Rule.** If a scorer would write it (names, calls, scores, status, button verbs), it is Kalam in ink or graphite. If a printed rulebook or the game itself would state it (labels, hints, rules, card indices, suit symbols), it is Hind.

**The Print Suits Rule.** Suit symbols are always set in Hind, even inside handwritten lines, so they stay crisp and recognisable.

## Layout

A single phone-width page (max 480px) centred on the desk. The left padding is a fixed 40px gutter that clears the double red margin rule (at 26px and 30px, safe-area aware); the right gutter is 16px. Above 520px wide the page gains a desk shadow to read as a sheet lying on a surface.

Vertical rhythm is the 28px line grid (1.75rem): the ruled background repeats every line, and block heights snap to whole or half lines: the header is two lines, each ledger row one line, inputs one and a half, sheet headers one and a half, Screen rows one and a quarter. During play the page is locked to the viewport (100dvh minus safe areas) and stacks: header, ledger, table (flexes), status or call pad, hand. With six or more players the ledger folds into two columns.

Sheets reuse the same ruled page with `background-attachment: local` so the rules scroll with the writing. Below 700px of height, the hand and call pad tighten (call numbers 2.4rem).

### Named Rules
**The Line Grid Rule.** Vertical sizes are multiples of the 28px line (whole, half, or one and a half). Text sits on the rules, not between them.

## Elevation & Depth

Paper is flat; only objects resting on paper have depth. Cards, the incoming sticky note, the sheet sliding up and the page on the desk carry soft, warm, two-layer shadows. Ink marks, buttons, chips and the ledger never cast shadows; their emphasis is drawn.

### Shadow Vocabulary
- **Card on paper** (`0 1px 2px rgba(40,30,10,.18), 0 6px 14px rgba(40,30,10,.10)`; black paper: `0 1px 2px rgba(0,0,0,.5), 0 8px 18px rgba(0,0,0,.35)`): every playing card.
- **Selected card** (`0 0 0 2px` ink ring plus the card shadow): the card raised for a second tap.
- **Sticky note** (`0 2px 3px rgba(0,0,0,.12), 0 10px 18px rgba(0,0,0,.12)`): incoming chat note.
- **Sheet lift** (`0 -10px 30px rgba(0,0,0,.2)`): bottom sheets over a 38% scrim.
- **Page on desk** (`0 0 0 1px rgba(0,0,0,.06), 0 20px 50px rgba(0,0,0,.18)`): wide viewports only.

### Named Rules
**The Real Objects Rule.** Only things you could pick up off the table cast a shadow. A mark drawn on the page never does.

## Shapes

Two shape languages, one per material. Drawn controls use a wobbly hand-drawn border (asymmetric elliptical radius, 255px 14px 225px 14px / 14px 225px 14px 255px) with a 1.5 to 1.75px ink stroke, so buttons and chips look outlined by pen. Physical objects have true geometry: cards at 7px corners, sheets at 14px top corners, the toast at 6px. Round targets (icon buttons, call numbers) are circles. Pen marks are SVG paths with round caps and joins at 1.8px (2.4px for the winning-card loop), deliberately imperfect: loops overshoot where they close, strikes rise slightly, tallies lean.

Cards on the table rotate by a stable per-card angle (about -3.6 to +3.6 degrees); tags beside cards tilt -4 degrees; the sticky note tilts 2.5 degrees.

## Components

### Buttons
Pen-outlined and confident.
- **Shape:** hand-drawn wobble (rounded.drawn), 1.75px ink border, min-height 2.75rem (3.25rem for the home "Deal me in").
- **Primary:** ink-filled with page-coloured Kalam 700 label, 1.15rem.
- **Outline:** transparent with ink border and ink label (menu actions such as "Read the rules", "Leave the table").
- **Press:** scale to 0.97 over 0.15s, cubic-bezier(.2,.8,.2,1). Disabled at 40% opacity.
- **Focus:** a 2px dashed ink outline offset 3px, system-wide.

### Icon buttons
40px circles holding 22px pen-stroke SVG icons (the Screen, chat, menu, close, turn arrow), drawn with the same stroke as the marks. Pressed state is an ink-soft fill. The unread count is a small red pill badge in print.

### Chips
- **Style:** Kalam ink label, transparent border at rest in the drawn shape, min 2.25rem tall.
- **State:** hover shows an ink-soft outline; selected gets a full ink outline, ink-soft fill and bold label. Used for player count, bot level, timer, paper, text size, and quick chat replies.

### Inputs / Fields
- **Style:** a writing line, not a box: transparent, a 1.75px ink underline, Kalam 1.5rem ink text, pencil placeholder ("write it here").
- **Focus:** the underline thickens to 2.5px; no outline ring.
- **Error:** red print line beneath.

### Playing card (signature)
Cream card face with 7px corners, a thin card-edge border and the card-on-paper shadow. Rank and suit in both corners (Hind 600), large centre pip. Red suits in card red. On the table each card carries a stable slight rotation and drops in. In the hand, cards fan with suit groups separated by a 7px gap; legal cards lift 10px with an ink border, the selected card lifts 24px with an ink ring, illegal cards desaturate (saturate .5, brightness .86, 75% opacity). Flick up to play, or tap twice.

### Ledger row
One ruled line per player, always a single column: red turn arrow, a small circled calling-order number (filled ink for first caller, red outline for last), Kalam name (ink and bold for the player, highlighter swipe for the current turn, a print "bot" tag), hands made written as digits "1 of 2" (red when over the call; "called N" while calling), and the total. New calls write in with a left-to-right clip reveal.

### Call pad
Replaces the status line while calling. A grid of 2.75rem circular Kalam numbers. The forbidden last-caller number is pencil grey with a red pen strike and cannot be tapped; a print note explains why. No call is ever suggested.

### The Screen
The scoresheet table, fixed layout so 8 players fit 390px. Between rounds it sits inline on the page (with a Hide button that returns to the table and a Deal bar); mid-round it opens as a full sheet. Kalam cells on 1.25-line rows, sticky ink-underlined player header, sticky double-ruled Total footer. A made call shows the call in pencil beside its points in bold print ink; a missed call is struck in red with the hands actually made in small red. The current round row is highlighted; future rows sit at half-opacity pencil. A newly completed row writes its points and draws its strikes one player at a time.

### Sheets
Bottom sheets made of the same ruled page, sliding up 0.34s over a dark scrim, with a Kalam headline and a pen-stroke close icon. The Screen and game over take the full height without radius.

### Sticky note and toast
Incoming chat appears as a tilted yellow sticky note in the top-right corner (sticks in with a slight overshoot, auto-removes after 3.4s, opens chat on tap). System messages use a small graphite toast at the bottom, tilted -1 degree.

### Motion grammar
- **Pen stroke:** paths with pathLength 1 animate stroke-dashoffset 1 to 0 over 0.45s, cubic-bezier(.4,.1,.3,1), staggered by a per-mark delay (--d). Used for loops, strikes, tallies, underlines and stars.
- **Write in:** clip-path reveal left to right, 0.5s, cubic-bezier(.3,.7,.2,1), for newly written calls.
- **Highlighter swipe:** background-size 0 to 100%, 0.35s ease-out.
- **Card drop:** from 60px above (150px below for my own card), rotate 0 and scale 1.08 to its resting angle, 0.42s, cubic-bezier(.2,.9,.25,1.05).
- **Hand lift:** transform 0.18s, cubic-bezier(.2,.8,.2,1).
- **Sheet up:** 0.34s, cubic-bezier(.2,.85,.25,1). **Sticky note:** 0.35s, cubic-bezier(.2,.9,.3,1.2).
- **Waiting slot:** dashed ink outline breathing over 1.6s.
- Reduced motion collapses every animation and transition to near zero; marks appear already drawn.

## Do's and Don'ts

### Do:
- **Do** set every vertical measure on the 28px line grid (1.75rem), in whole, half or one-and-a-half lines.
- **Do** write anything a scorer would write in Kalam and print everything else in Hind (The Who Wrote It Rule).
- **Do** show state with pen marks: highlighter for whose turn, an ink loop around the winning card, a red strike for missed or forbidden. Numbers are written as digits, never tallies; calls are never suggested.
- **Do** draw marks with stroke-dashoffset at 0.45s and stagger them with per-mark delays, and keep them static under reduced motion.
- **Do** keep cards cream with suit symbols on both papers, and give each table card a stable slight rotation.
- **Do** define both papers for every new colour role: white paper and black paper with gel ink.

### Don't:
- **Don't** fill regions with colour panels or boxed containers on the page; the only fills are ink-soft on controls, the ink primary button, highlighter swipes, and objects lying on the paper (cards, sticky note, toast, badge).
- **Don't** use red for primary actions or decoration; red pen means strike, miss, cut or warning.
- **Don't** add shadows to drawn marks, buttons, chips or text (The Real Objects Rule).
- **Don't** use emoji or font glyphs as interface icons; icons are pen-stroke SVGs (suit symbols are content, not icons).
- **Don't** rely on red versus black alone to tell suits apart.
