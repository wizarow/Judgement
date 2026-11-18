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
- Lobby: host adds/removes bots and players, sets the turn timer (Off, 30 s, 45 s, 1 min, 2 min).
- Game: lead-suit banner ("Follow ♣ Clubs"), LEADS / CUT tags on table cards, tap a card to select it, press Play.
  After the last hand of a round the table is held for 4 seconds, then the Screen opens.
- Screen: rounds down the side, players across, each with Call and Made. Made calls highlighted, missed calls struck off,
  Total pinned at the bottom. Open any time with the Screen button.
- Chat: a strip under the round info shows the latest message. Tap to open a box over the players strip only
  (never over the table or your cards). Everyone sees everything; no private messages.

## Settings (gear on the name pill)
Name, turn timer (host), text size (Normal, Large, Larger, Huge), theme (Midnight, Ivory, Felt, Ruby),
white or black cards, host: remove a player (a bot takes the seat mid-game). Saved per phone.
Theme no longer rotates between rounds.

## Notes
- Name is required to create or join. Rejoin after a refresh is automatic on the same device.
- Turn timer: when it runs out a bot plays that turn and a note appears in the chat. Default is Off.
- A disconnected human who is up to play is auto-played by a bot after 25 seconds.
- Set JD_FAST=1 to run bots instantly (testing only).
