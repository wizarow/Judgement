'use strict';
// Voyeurs (late joiners who watch), seat handover, taking a seat back, away -> bot, and the "last hand" kept for the Screen.
const assert = require('assert');
const { Game, legalCards } = require('../public/engine.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// a started game: `humans` people (tokens t0, t1...) and bots up to `size`
function started(humans, size) {
  const g = new Game('V', { fast: true });
  for (let i = 0; i < humans; i++) assert(g.addHuman('P' + i, 't' + i).ok);
  g.size = size;
  assert(g.act(g.hostId, { type: 'start' }).ok);
  return g;
}
// plays the humans' turns for them (the same routine that plays an absent player) until pred() holds
async function until(g, pred, label) {
  for (let i = 0; i < 4000; i++) {
    if (pred()) return;
    const cur = g.players[g.turnIdx];
    if ((g.phase === 'calling' || g.phase === 'playing') && cur && !cur.bot && cur.connected) g.botAct(cur.id);
    await sleep(1);
  }
  throw new Error('timed out waiting for ' + label);
}
const humanOf = (g, tok) => g.players.filter(p => p.token === tok)[0];

(async () => {
  // ---- joining late
  {
    const g = new Game('L', { fast: true });
    g.addHuman('Host', 'a');
    assert(g.addVoyeur('Late', 'v1').err, 'in the lobby people join as players, not voyeurs');
    g.size = 3; g.act(1, { type: 'start' });
    assert(g.addHuman('Late', 'v1').err, 'a started game does not take players');
    const r = g.addVoyeur('Late', 'v1');
    assert(r.ok, 'a started game takes voyeurs');
    const r2 = g.addVoyeur('late', 'v2');
    assert.notStrictEqual(g.voyeurById(r2.pid).name.toLowerCase(), 'late', 'voyeur names are unique');
    const r3 = g.addVoyeur('Host', 'v3');
    assert(r3.ok && g.voyeurById(r3.pid).name !== 'Host', 'a voyeur cannot share a player name');
    assert(g.addVoyeur('', 'x').err, 'name required');
    const s = g.snapshot(r.pid);
    assert.strictEqual(s.voyeur, true);
    assert.deepStrictEqual(s.hand, [], 'a voyeur sees no hand by default');
    assert.strictEqual(s.legal.length, 0);
    assert.strictEqual(s.callInfo, null);
    assert.strictEqual(s.players.length, 3);
    assert(!/"token"/.test(JSON.stringify(s)) && !/v1|v2/.test(JSON.stringify(s)), 'no tokens in snapshots');
    assert(g.snapshot(1).voyeurs.length === 3, 'players see who is watching');
    assert(g.chat.some(m => m.sys && /Late joined as a voyeur/.test(m.text)), 'table is told');
    for (const bad of [{ type: 'call', n: 0 }, { type: 'play', card: 'S2' }, { type: 'start' }, { type: 'kick', pid: 1 }, { type: 'size', size: 4 }, { type: 'next' }, { type: 'again' }]) {
      assert(g.act(r.pid, bad).err, 'voyeurs cannot ' + bad.type);
    }
    assert(g.act(r.pid, { type: 'chat', text: 'wah!' }).ok);
    const m = g.chat[g.chat.length - 1];
    assert(m.voy === true && m.name === 'Late' && m.pid === r.pid, 'voyeur chat is tagged');
    assert(g.act(r.pid, { type: 'rename', name: 'Peeper' }).ok && g.voyeurById(r.pid).name === 'Peeper');
    g.destroy();
  }
  // ---- cap and pruning
  {
    const g = started(1, 3);
    for (let i = 0; i < 10; i++) assert(g.addVoyeur('V' + i, 'v' + i).ok);
    assert(g.addVoyeur('One more', 'vx').err, 'at most 10 voyeurs');
    assert(g.joinInfo('x').full === true);
    const kicked = [];
    g.onKick = (token) => kicked.push(token);
    g.setConnected(g.voyeurs[0].id, false);
    g.pruneVoyeurs(Date.now() + 60000);
    assert.strictEqual(g.voyeurs.length, 10, 'a brief drop is forgiven');
    g.pruneVoyeurs(Date.now() + 121000);
    assert.strictEqual(g.voyeurs.length, 9, 'a voyeur gone for over 2 minutes is dropped');
    assert.deepStrictEqual(kicked, ['v0']);
    g.destroy();
  }
  // ---- seeing a hand takes the player's yes
  {
    const g = started(2, 4);
    const host = humanOf(g, 't0'), other = humanOf(g, 't1');
    const bot = g.players.filter(p => p.bot)[0];
    const v = g.addVoyeur('Vee', 'tv', other.id);
    const vid = v.pid;
    let s = g.snapshot(vid);
    assert.deepStrictEqual(s.hand, [], 'a pending request shows nothing');
    assert.deepStrictEqual(s.peek, { pid: other.id, name: other.name, state: 'pending' });
    assert(g.act(host.id, { type: 'peekreply', vid, ok: true }).err, 'only the asked player can answer');
    assert(g.act(other.id, { type: 'peekreply', vid, ok: false }).ok);
    s = g.snapshot(vid);
    assert.strictEqual(s.peek.state, 'denied');
    assert.deepStrictEqual(s.hand, [], 'denied means table only');
    assert(g.act(vid, { type: 'peek', pid: other.id }).ok, 'a voyeur can ask again');
    assert.strictEqual(g.snapshot(vid).peek.state, 'pending');
    assert(g.act(other.id, { type: 'peekreply', vid, ok: true }).ok);
    s = g.snapshot(vid);
    assert.deepStrictEqual(s.hand, other.hand, 'allowed: they see that hand');
    assert(s.hand.length > 0);
    assert.deepStrictEqual(s.legal, [], 'a voyeur never gets to play it');
    assert.deepStrictEqual(g.snapshot(host.id).hand, host.hand, 'players still see only their own');
    assert(g.act(vid, { type: 'peek', pid: bot.id }).err, 'bots have no one to ask');
    assert(g.act(other.id, { type: 'peekreply', vid, ok: false }).ok, 'a yes can be taken back');
    assert.deepStrictEqual(g.snapshot(vid).hand, []);
    assert(g.act(vid, { type: 'peek', pid: null }).ok);
    assert.strictEqual(g.snapshot(vid).peek, null, 'back to the table only');
    // choosing at join time
    const w = g.addVoyeur('Wee', 'tw', bot.id);
    assert.strictEqual(g.snapshot(w.pid).peek, null, 'asking for a bot at join is ignored');
    g.destroy();
  }
  // ---- leaving: the seat goes to a voyeur or a bot
  {
    const g = started(2, 3);
    const a = humanOf(g, 't0'), b = humanOf(g, 't1');
    await until(g, () => g.round && g.round.i === 0 && g.phase === 'playing' && g.players.every(p => p.call !== null), 'round 1 play');
    const vid = g.addVoyeur('Vee', 'tv').pid;
    const seatId = b.id, hand = b.hand.slice(), call = b.call, score = b.score;
    assert(g.act(b.id, { type: 'leave', to: vid }).ok);
    const seat = g.byId(seatId);
    assert(!seat.bot && seat.token === 'tv' && seat.name === 'Vee', 'the voyeur sits in the seat');
    assert.deepStrictEqual(seat.hand, hand, 'hand stays with the seat');
    assert.strictEqual(seat.call, call); assert.strictEqual(seat.score, score);
    assert.strictEqual(g.voyeurs.length, 0);
    assert.strictEqual(g.byToken('t1'), undefined, 'the old token is gone');
    assert.strictEqual(g.byToken('tv').id, seatId, 'the voyeur token now points at the seat');
    assert.strictEqual(g.snapshot(seatId).voyeur, false);
    assert.deepStrictEqual(g.snapshot(seatId).hand, hand);
    assert.strictEqual(g.hostId, a.id);
    assert(g.chat.some(m => m.sys && /P1 left\. Vee takes the seat/.test(m.text)));
    // the host leaves and a voyeur takes the seat: the host is NOT the newcomer
    const v2 = g.addVoyeur('Zed', 'tz').pid;
    assert(g.act(a.id, { type: 'leave', to: v2 }).ok);
    assert.strictEqual(g.hostId, seatId, 'host passes to the other player, not the newcomer');
    g.destroy();
  }
  {
    // no voyeur chosen (or the chosen one is gone): a bot takes the seat, and the person may come back by name
    const g = started(2, 4);
    const b = humanOf(g, 't1');
    const vid = g.addVoyeur('Vee', 'tv').pid;
    g.setConnected(vid, false);
    assert(g.act(b.id, { type: 'leave', to: vid }).ok);
    assert(g.byId(b.id).bot, 'a voyeur who is not there cannot take a seat');
    assert(g.chat.some(m => m.sys && /P1 left\. A bot plays the seat/.test(m.text)));
    assert.strictEqual(g.voyeurs.length, 1);
    assert.strictEqual(g.seatByName('p1').id, b.id, 'the seat remembers who it was');
    assert.strictEqual(g.joinInfo('P1').claim, true);
    assert.strictEqual(g.joinInfo('Nobody').claim, false);
    assert.strictEqual(g.reclaim('t1'), null, 'leaving on purpose gives no saved token to reclaim with');
    const back = g.claimByName('P1', 'new');
    assert(back && !back.bot && back.token === 'new', 'back by name');
    assert(g.chat.some(m => m.sys && /P1 is back/.test(m.text)));
    assert.strictEqual(g.claimByName('P1', 'x2'), null, 'a seat can only be taken back once');
    g.destroy();
  }
  {
    // the host removes someone: same handover, and a removed player cannot come back
    const g = started(3, 4);
    const [h, b, c] = ['t0', 't1', 't2'].map(t => humanOf(g, t));
    const vid = g.addVoyeur('Vee', 'tv').pid;
    assert(g.act(b.id, { type: 'kick', pid: c.id }).err, 'only the host removes');
    assert(g.act(h.id, { type: 'kick', pid: c.id, to: vid }).ok);
    assert(!g.byId(c.id).bot && g.byId(c.id).token === 'tv');
    assert(g.chat.some(m => m.sys && /P2 was removed\. Vee takes the seat/.test(m.text)));
    assert(g.act(h.id, { type: 'kick', pid: b.id }).ok);
    assert(g.byId(b.id).bot);
    assert.strictEqual(g.seatByName('P1'), undefined, 'a removed player has no seat to come back to');
    g.destroy();
  }
  // ---- the host gives a bot's seat to a voyeur, between rounds
  {
    const g = started(1, 3);
    const h = humanOf(g, 't0');
    const vid = g.addVoyeur('Vee', 'tv').pid;
    const bot = g.players.filter(p => p.bot)[0];
    assert(g.act(h.id, { type: 'seat', vid, pid: bot.id }).err, 'not mid-round');
    await until(g, () => g.phase === 'roundover', 'end of round 1');
    assert(g.act(vid, { type: 'seat', vid, pid: bot.id }).err, 'voyeurs cannot hand out seats');
    assert(g.act(h.id, { type: 'seat', vid, pid: h.id }).err, 'only bot seats');
    const was = bot.score;
    assert(g.act(h.id, { type: 'seat', vid, pid: bot.id }).ok);
    assert(!bot.bot && bot.token === 'tv' && bot.name === 'Vee' && bot.score === was, 'score stays with the seat');
    assert.strictEqual(g.voyeurs.length, 0);
    assert(g.act(h.id, { type: 'next' }).ok);
    assert.strictEqual(g.phase, 'calling');
    g.destroy();
  }
  // ---- away: two auto-played turns in a row turn the seat into a bot
  {
    const g = started(2, 4);
    const b = humanOf(g, 't1');
    g.setConnected(b.id, false);
    g.setConnected(b.id, true);
    g.noteAway(b);
    assert.strictEqual(b.awayAuto, 1); assert(!b.bot, 'one auto-played turn is not enough');
    g.setConnected(b.id, false); g.setConnected(b.id, true);
    assert.strictEqual(b.awayAuto, 0, 'coming back resets the count');
    g.noteAway(b);
    g.act(b.id, { type: 'chat', text: 'hi' });   // anything else changes nothing...
    assert.strictEqual(b.awayAuto, 1);
    g.noteAway(b);
    assert(b.bot, 'two in a row: a bot plays the seat');
    assert(g.chat.some(m => m.sys && /P1 was away for 2 turns/.test(m.text)));
    assert.strictEqual(b.ex.claim, 't1');
    assert.strictEqual(g.byToken('t1'), undefined);
    const back = g.reclaim('t1');
    assert(back === b && !b.bot && b.token === 't1', 'the same browser takes the seat straight back');
    assert.strictEqual(g.reclaim('t1'), null, 'nothing left to reclaim');
    g.destroy();
  }
  {
    // a turn the player plays themselves resets the count
    const g = started(2, 3);
    await until(g, () => g.phase === 'playing' && !g.players[g.turnIdx].bot, 'a human to play');
    const human = g.players[g.turnIdx];
    human.awayAuto = 1;
    const card = legalCards(human.hand, g.led)[0];
    assert(g.act(human.id, { type: 'play', card }).ok);
    assert.strictEqual(human.awayAuto, 0);
    g.destroy();
  }
  {
    // end to end: an absent player's turns are played for them, and after two the seat is a bot
    const g = started(2, 4);
    const b = humanOf(g, 't1');
    g.setConnected(b.id, false);
    await until(g, () => b.bot || g.phase === 'gameover', 'the absent seat to become a bot');
    assert(b.bot, 'seat became a bot');
    assert.strictEqual(b.ex.name, 'P1');
    assert(g.humans().length === 1 && !g.closed, 'the room stays open for them to return');
    g.destroy();
  }
  {
    // a connected player whose turn timer runs out is auto-played but never loses the seat
    const g = new Game('T', { fast: true });
    g.addHuman('Solo', 'a'); g.size = 3; g.timerSec = 30; g.timerScale = 0.001;
    g.act(1, { type: 'start' });
    await sleep(300);
    assert(g.chat.filter(m => /Time’s up for Solo/.test(m.text)).length >= 3, 'timed out repeatedly');
    assert(!g.byId(1).bot, 'still a person');
    g.destroy();
  }
  {
    // the only human drops off: the room stays, and they can come back
    const g = started(1, 3);
    g.setConnected(1, false);
    await until(g, () => g.byId(1).bot || g.phase === 'gameover', 'bot takeover');
    assert(g.byId(1).bot && !g.closed);
    assert.strictEqual(g.hostId, null);
    assert(g.reclaim('t0'));
    assert.strictEqual(g.hostId, 1, 'with nobody else, they are the host again');
    g.destroy();
  }
  // ---- every hand of every round is kept; Hands won is the player's own
  {
    const g = started(1, 3);
    await until(g, () => g.phase === 'roundover', 'end of round 1');
    const h = g.history[0];
    assert.strictEqual(h.tricks.length, h.cards, 'one hand per card in the round');
    h.tricks.forEach(t => {
      assert.strictEqual(t.trick.length, 3, 'one card per player in every hand');
      assert(t.trick.some(x => x.pid === t.winner), 'the winner played in it');
    });
    const wins = g.snapshot(1).wins;
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].i, 0); assert.strictEqual(wins[0].done, true);
    assert.strictEqual(wins[0].hands.length, g.byId(1).made, 'exactly the hands this player made');
    assert(wins[0].hands.every(t => t.winner === 1), 'only hands this player won');
    const total = g.players.reduce((n, p) => n + g.snapshot(p.id).wins[0].hands.length, 0);
    assert.strictEqual(total, h.cards, 'every hand is won by exactly one player');
    assert(!('tricks' in g.snapshot(1).history[0]), 'history stays light: score lines only');
    g.act(1, { type: 'next' });
    assert.strictEqual(g.snapshot(1).wins.length, 2, 'the round under way is listed too');
    assert.strictEqual(g.snapshot(1).wins[1].done, false);
    assert.strictEqual(g.snapshot(1).wins[1].i, 1);
    await until(g, () => g.phase === 'roundover' && g.history.length === 2, 'end of round 2');
    const w2 = g.snapshot(1).wins;
    assert.strictEqual(w2.length, 2, 'a finished round is not listed twice');
    assert.deepStrictEqual(w2[0].hands, wins[0].hands, 'earlier rounds are kept as they were');
    g.destroy();
  }
  {
    // every hand is held 6 s on the table in live rooms
    const live = new Game('X', {});
    assert.strictEqual(live.handHoldMs, 6000);
    live.destroy();
  }
  {
    // a voyeur sees the hands won of the player they may look at, and of nobody else
    const g = started(2, 3);
    const other = humanOf(g, 't1');
    const vid = g.addVoyeur('Vee', 'tv', other.id).pid;
    assert.strictEqual(g.snapshot(vid).wins, null, 'no yes yet: no hands won');
    g.act(other.id, { type: 'peekreply', vid, ok: true });
    assert(Array.isArray(g.snapshot(vid).wins));
    assert.strictEqual(g.snapshot(vid).wins.length, 1, 'round 1 under way');
    g.act(other.id, { type: 'peekreply', vid, ok: false });
    assert.strictEqual(g.snapshot(vid).wins, null);
    g.destroy();
  }
  // ---- game end: Play again deals at once with the same table; Game setup goes to the lobby; both wait
  async function finish(g) {
    for (let r = 0; r < 30 && g.phase !== 'gameover'; r++) {
      await until(g, () => g.phase === 'roundover' || g.phase === 'gameover', 'round ' + r);
      if (g.phase === 'roundover') g.act(g.hostId, { type: 'next' });
    }
    assert.strictEqual(g.phase, 'gameover');
  }
  {
    const g = started(1, 4);
    const botNames = g.players.filter(p => p.bot).map(p => p.name).sort();
    const v1 = g.addVoyeur('Vee', 'tv').pid, v2 = g.addVoyeur('Wee', 'tw').pid;
    await finish(g);
    assert(g.act(v1, { type: 'again' }).err, 'voyeurs cannot start it');
    assert(g.act(1, { type: 'again' }).ok, 'Play again');
    assert.strictEqual(g.phase, 'calling', 'a new game is dealt at once');
    assert.strictEqual(g.round.i, 0);
    assert.strictEqual(g.history.length, 0); assert.strictEqual(g.roundTricks.length, 0);
    assert(g.players.every(p => p.score === 0 && p.hand.length === g.round.cards));
    assert.deepStrictEqual(g.humans().map(p => p.id).sort(), [1, v1, v2].sort(), 'voyeurs sit down');
    assert.strictEqual(g.voyeurs.length, 0);
    assert.strictEqual(g.players.length, 4, 'the table stays at its size');
    const keptBots = g.players.filter(p => p.bot).map(p => p.name);
    assert.strictEqual(keptBots.length, 1);
    assert(botNames.includes(keptBots[0]), 'the bots are the same bots as before');
    assert.strictEqual(g.byToken('tv').id, v1, 'a voyeur keeps their token and id as a player');
    assert.strictEqual(g.snapshot(v1).voyeur, false);
    assert.strictEqual(g.snapshot(1).againIn, null, 'no wait outside game over');
    g.destroy();
  }
  {
    // same names when nobody joins; a person who left during the game stays a bot seat
    const g = started(2, 4);
    const names = g.players.map(p => p.name).sort();
    g.act(humanOf(g, 't1').id, { type: 'leave' });
    await finish(g);
    assert(g.act(g.hostId, { type: 'again' }).ok);
    assert.deepStrictEqual(g.players.map(p => p.name).sort(), names, 'the same four names are at the table');
    assert.strictEqual(g.humans().length, 1);
    g.destroy();
  }
  {
    // Game setup: back to the lobby, where players can be added or removed, then Start
    const g = started(2, 4);
    const v = g.addVoyeur('Vee', 'tv').pid;
    await finish(g);
    assert(g.act(g.hostId, { type: 'setup' }).ok);
    assert.strictEqual(g.phase, 'lobby');
    assert.strictEqual(g.humans().length, 3, 'people stay, the voyeur sits down');
    assert(g.players.every(p => !p.bot), 'bot seats are shown as seats in the lobby');
    assert.strictEqual(g.voyeurs.length, 0);
    assert.strictEqual(g.snapshot(v).voyeur, false);
    assert.strictEqual(g.snapshot(g.hostId).n, 4);
    assert(g.act(g.hostId, { type: 'size', size: 6 }).ok, 'the host can add bots');
    assert(g.act(g.hostId, { type: 'start' }).ok);
    assert.strictEqual(g.players.length, 6);
    g.destroy();
  }
  {
    // a full table after the game: the extra voyeurs keep watching
    const g = started(8, 8);
    for (let i = 0; i < 2; i++) assert(g.addVoyeur('V' + i, 'v' + i).ok);
    g.phase = 'gameover'; g.overAt = Date.now() - 1e6;
    assert(g.act(g.hostId, { type: 'again' }).ok);
    assert.strictEqual(g.humans().length, 8);
    assert.strictEqual(g.voyeurs.length, 2);
    g.destroy();
  }
  {
    // the 30 s wait: the final scores stay up, enforced by the server
    const g = new Game('W', { fast: true });
    assert.strictEqual(g.againDelayMs, 0, 'fast test games skip it');
    const live = new Game('X', {});
    assert.strictEqual(live.againDelayMs, 30000, 'live rooms wait 30 s');
    live.destroy();
    g.againDelayMs = 1500;
    g.addHuman('A', 'a'); g.addHuman('B', 'b'); g.size = 3;
    g.act(1, { type: 'start' });
    await finish(g);
    const s = g.snapshot(2);
    assert(s.againIn > 0 && s.againIn <= 1500, 'everyone is told how long is left');
    const early = g.act(1, { type: 'again' });
    assert(early.err && /next game can start in/.test(early.err), 'Play again waits');
    assert(g.act(1, { type: 'setup' }).err, 'Game setup waits too');
    assert(g.act(2, { type: 'again' }).err, 'only the host');
    assert.strictEqual(g.phase, 'gameover');
    await sleep(1600);
    assert.strictEqual(g.snapshot(1).againIn, 0);
    assert(g.act(1, { type: 'setup' }).ok, 'then the host can go on');
    g.destroy();
  }
  // ---- the last human walking out only closes the room when nobody is watching
  {
    const g = started(1, 3);
    g.addVoyeur('Vee', 'tv');
    g.act(1, { type: 'leave' });
    assert(!g.closed, 'a voyeur is still watching');
    g.act(g.voyeurs[0].id, { type: 'leave' });
    assert(g.closed, 'nobody left');
    g.destroy();
  }

  console.log('ok   voyeurs: join, hand approval, handover, seat, take-back, away to bot, hands won, Play again, Game setup, the wait');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
