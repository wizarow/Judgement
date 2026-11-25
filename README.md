# Judgement

Call it. Make it. Win it. Online card game for 3 to 8 players, bots fill empty seats.
v2 · Ishan Atul's render

## Run locally
    node server.js      # http://localhost:3000   (Node 18+, no dependencies)
    npm test            # simulated games, 3 to 8 players
    node build.js       # writes dist/judgement-demo.html (offline demo: simulated rooms, friends played by the computer)

## Deploy on Render (same as Acquire)
1. Push this folder to a GitHub repo.
2. Render > New > Web Service > pick the repo.
3. Build command: leave empty. Start command: `node server.js`. Free plan is fine.
4. Open the URL, tap Start a room, share the room code or invite link.
Don't redeploy mid-game: live rooms are held in memory and drop on restart. The free plan sleeps when idle.

## Files
- `server.js`        rooms, live updates (server-sent events), static files (Brotli/gzip compressed once, with ETag so unchanged files cost a 304)
- `public/engine.js` all the rules and the bots; shared by server and browser
- `public/index.html` the whole UI (v2 notebook design)
- `docs/DESIGN.md`, `docs/PRODUCT.md`  design system and product notes
- `test/engine.test.js` rule checks and full simulated games
- `build.js`         makes the single-page demo

## Rules as built
- 3 to 8 players (bots count). Full deck dealt evenly, leftover cards removed at random.
  3p: 17 rounds, 4p: 13, 5p: 10, 6p: 8, 7p: 7, 8p: 6. Round 1 has most cards, down to 1.
- Cut suit by round: Spades, Hearts, Clubs, Diamonds, no cut, repeat.
- Round 1 first caller/leader is random, then rotates. Winner of a hand leads the next.
- Calls go in rotation, earlier calls visible, any number 0 up. Last caller can't make calls total the cards.
- Follow the led suit. Void: any card. Highest cut wins, else highest led suit. Ace high.
- Exact call = 10 + call. Missed = 0. Highest total after the 1-card round wins.

## Screens (v2 · notebook)
- Home: the page of a ruled notebook. Bigger fanned cards (tap to re-deal), name, Start a room, or Join with a 4-letter code.
  How to play top-left, Settings top-right. The whole block is centred with equal space above and below.
- Home also has "Auto start with bots · 4 players" at the bottom: makes a room, fills 3 bot seats and starts.
- Lobby ("Who's here"): big room code (tap to copy the invite link), each player with a green dot and Joined/Away.
  Host removes players (with confirm), adds bots (+ Add bot) and removes them right in the list. Guests see "Waiting for <host> to start".
- Game: header with round, cards and the cut suit (large). One ruled line per player: calling-order number
  (filled = calls first, red = calls last), name, "1 of 2" hands made vs called (red when over), total.
  Away players show "away · auto-plays"; on their turn the status reads "<name> is away · auto-plays in 85s".
  Calling pad: numbers 0..cards, the forbidden last-caller number struck out with the reason. No suggestions.
  Play a card by flicking it up, or tap it to pick it and press the Play button under your hand (tap again to put it back). The winning card gets an ink circle.
- Screen: shown on the page between rounds (Hide returns to the table with The Screen / Deal buttons).
  Made calls show their points in bold; missed calls are struck in red with the hands actually made.
- Chat: every new message pops up as a sticky note. Quick replies plus free text.

## Settings (one panel, sliders icon)
Players (host removes, with confirm), bots (lobby only), bot difficulty, turn timer,
paper (white by default; legal pad, mint, blush, sky, kraft, black, chalkboard, midnight; the phone's dark mode doesn't change it),
ink colour (blue, black, green, purple, red), text size, game screen (Fit to screen / Scrolling), your name, connection status, how to play, and Leave last.

## Notes
- Page load: `index.html` + `engine.js` are about 117 KB raw and about 34 KB with Brotli (about 0 KB when the phone already has the current version).
  Only these two files are compressed or cached; the live stream and the JSON API are untouched.
- Touch: hover highlights only on devices with a mouse (no stuck highlight after a tap), buttons use instant taps with no double-tap zoom,
  buttons are not selectable on long-press (chat text still is), and small buttons and chips are 44 px tall on touch screens.
- Invite: tapping the room code opens the phone's share menu (WhatsApp, Messages...) with the room code and link; it copies the link on devices without sharing.
- Back button / back swipe closes the open panel (Settings, chat, Screen, rules) before it leaves the page.
- Small or short screens (large phone text, landscape, 6-8 players): the game screen never cuts anything off. If it does not fit it scrolls,
  and the tray with the calling numbers, status line and your hand stays pinned to the bottom. In landscape the table and players
  are on the left and the tray on the right. If a browser reports the wrong window height and the tray would end up below the visible edge,
  the app switches itself to the scrolling page and says so. Settings > Game screen > Scrolling forces that mode.
- Name is required to create or join. Rejoin after a refresh is automatic on the same device.
- Turn timer: when it runs out a bot plays that turn and a note appears in the chat. Default is Off.
- A disconnected human who is up to play is auto-played after 90 seconds (shown as a countdown). A human whose turn timer runs out is also auto-played, always at Medium.
- Bot levels: Easy calls loosely and plays half its cards at random. Medium is the original bot. Hard calls from a fitted
  estimate (cut-suit strength, cards still out) and leads smarter when it does not want another hand. Over simulated
  games (`node test/botsim.js 2000 easy,medium,hard,medium`) Hard averages roughly 15-20% above Medium, Medium roughly 30% above Easy.
- Connection: the server streams updates (SSE) with a heartbeat every 10 s. A phone that stops hearing from it for 16 s
  reconnects on its own, resyncs when it wakes or the network returns, and falls back to polling `/api/state` if the stream keeps failing.
  Your own moves update your screen from the action reply, without waiting for the stream. Every request has a time limit (6-8 s), so a hung request never stalls recovery.
  Your own call or card shows instantly and the server's reply confirms it (resync after 3 s if it never does).
  A red "Reconnecting…" / "Offline" note in the header shows the state; Settings shows the round-trip time. `/health` is there for an uptime pinger (Render free instances sleep after 15 idle minutes).
- Set JD_FAST=1 to run bots instantly (testing only).
