# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Single-file static HTML/CSS/JS (game engine, bots and UI in one page), published as a private claude.ai artifact for demos. The production app (from the existing build) adds a small server with room codes, a live event stream and reconnect logic.

## Users

Friends playing remotely, each on their own phone, spread across homes or cities. Chat and seeing who is present matter, because they are not in the same room.

## Product Purpose

Judgement is a calling trick-taking card game (also known as Kachuful / Oh Hell) for 3–8 players. Each round, players call how many hands they will win, then try to make that number exactly. The app lets a group of friends play it together online in a room, with bots filling empty seats. Success is a group that plays a whole game (many rounds) and wants to play again.

## Positioning

A faithful, rules-correct house version of a game families already play with a physical deck, with the "Screen" (the running scoresheet) and the house conventions built in, instead of a generic card-game platform.

## Operating Context

- Phone-first, portrait, one-handed during play. Sessions last a whole game (up to 17 rounds for 3 players).
- Rooms are joined by a 4-letter code or invite link; the host sets players, bots, turn timer and bot difficulty.
- The table talks through the built-in chat.

## Capabilities and Constraints

- 3–8 players; the deck is dealt evenly, leftover cards removed. Round 1 has the most cards, dropping by one to a single card.
- Calling goes round the table; the last caller cannot make the calls total the number of cards.
- Cut (trump) rotates Spades, Hearts, Clubs, Diamonds, no cut.
- Must follow the led suit; the highest cut beats the led suit.
- Scoring: exact call = 10 + call; otherwise 0.
- Bots at Easy / Medium / Hard; turn timer Off / 30 s / 45 s / 1 min / 2 min; chat; host can remove players.
- Terminology to keep: "call", "cut", "hand" (a trick), "the Screen" (scoresheet), "round".

## Brand Commitments

Name: Judgement. Tagline in use: "Call it. Make it. Win it." Creator credit: Ishan Atul.

## Evidence on Hand

None (no testimonials, user counts or reviews). Do not invent any.

## Product Principles

1. Rules are always correct and enforced; the UI never lets a player make an illegal move.
2. The table state (whose turn, what was led, who is winning the hand, everyone's call vs made) is readable at a glance on a phone.
3. Every action is quick: a turn should take one deliberate gesture.
4. The game should feel like an occasion: calls, cuts, made and missed calls, and the final winner get their moment.
5. Remote friends should feel present at the table.

## Accessibility & Inclusion

Adjustable text size and colour themes exist in the current app; red/black suit colours must not be the only cue (suit symbols always shown).
