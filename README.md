# Judgement

Call it. Make it. Win it. Online card game for 3 to 8 players, bots fill empty seats.
v1 · Ishan Atul's render

## Run locally
    node server.js      # http://localhost:3000   (Node 18+, no dependencies)
    npm test            # simulated games, 3 to 8 players
    node build.js       # writes dist/judgement-demo.html (whole app in one page, switch between phones)

## Deploy on Render (same as Acquire)
1. Push this folder to a GitHub repo.
2. Render > New > Web Service > pick the repo.
3. Build command: leave empty. Start command: `node server.js`. Free plan is fine.
4. Open the URL, tap Start a room, share the room code or invite link.
Don't redeploy mid-game: live rooms are held in memory and drop on restart. The free plan sleeps when idle.

## Files
- `server.js`        rooms, live updates (server-sent events), static files
- `public/engine.js` all the rules and the bots; shared by server and browser
- `public/index.html` the whole UI
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

## Screens
- Home: name (required), Start a room, or Join room with a 4-letter code. Rules top-left, settings top-right.
- Lobby: big room code (tap to copy the invite link), host adds/removes bots and players, sets the turn timer (Off, 30 s, 45 s, 1 min, 2 min).
- Game: small numbers on the players strip show this round's calling order (1 calls first, the last number calls last).
  Lead-suit banner ("Follow ♣ Clubs"), LEADS / CUT tags on table cards, tap a card to select it, press Play.
  After the last hand of a round the table is held for 4 seconds, then the Screen opens.
- Screen: rounds down the side, players across, each with Call and Made. Made calls highlighted, missed calls struck off,
  Total pinned at the bottom. Open any time with the Screen button.
- Chat: a strip under the round info shows the latest message. Tap to open a box over the players strip only
  (never over the table or your cards). Everyone sees everything; no private messages.

## Settings (gear on the name pill)
Name, turn timer (host), bot difficulty (host: Easy, Medium, Hard; default Medium), connection status, text size (Normal, Large, Larger, Huge), theme (Midnight, Ivory, Felt, Ruby),
white or black cards, host: remove a player (a bot takes the seat mid-game). Saved per phone.
Theme no longer rotates between rounds.

## Notes
- Name is required to create or join. Rejoin after a refresh is automatic on the same device.
- Turn timer: when it runs out a bot plays that turn and a note appears in the chat. Default is Off.
- A disconnected human who is up to play is auto-played after 25 seconds. A human whose turn timer runs out is also auto-played, always at Medium.
- Bot levels: Easy calls loosely and plays half its cards at random. Medium is the original bot. Hard calls from a fitted
  estimate (cut-suit strength, cards still out) and leads smarter when it does not want another hand. Over simulated
  games (`node test/botsim.js 2000 easy,medium,hard,medium`) Hard averages roughly 15-20% above Medium, Medium roughly 30% above Easy.
- Connection: the server streams updates (SSE) with a heartbeat every 10 s. A phone that stops hearing from it for 25 s
  reconnects on its own, resyncs when it wakes or the network returns, and falls back to polling `/api/state` if the stream keeps failing.
  Your own moves update your screen from the action reply, without waiting for the stream. A small dot next to the version line shows the state;
  Settings shows the round-trip time. `/health` is there for an uptime pinger (Render free instances sleep after 15 idle minutes).
- Set JD_FAST=1 to run bots instantly (testing only).
