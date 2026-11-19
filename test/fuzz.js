'use strict';
// Rules-engine fuzzer: random tables, random legal and illegal moves, leaves/kicks/host changes mid-game.
// node test/fuzz.js [games]
const assert = require('assert');
const E = require('../public/engine.js');
const { Game } = E;
const suitOf = c => c[0], rankOf = c => +c.slice(1);
const R = n => Math.floor(Math.random() * n);
const pick = a => a[R(a.length)];
const fails = [];
function check(cond, msg, ctx) { if (!cond) { fails.push(msg + (ctx ? ' ' + ctx : '')); if (fails.length > 20) { console.log(fails.join('\n')); process.exit(1); } } }

function refWinner(trick, cut) {          // independent trick-winner implementation
  const led = suitOf(trick[0].card);
  let best = null;
  for (const t of trick) {
    const key = suitOf(t.card) === cut ? 100 + rankOf(t.card) : suitOf(t.card) === led ? rankOf(t.card) : 0;
    if (!best || key > best.key) best = { key, pid: t.pid };
  }
  return best.pid;
}

function oneGame(seed) {
  const n = 3 + R(6);
  const g = new Game('FZ', { fast: true });
  g.schedule = function () {}; g.onChange = function () {};
  const hn = 1 + R(n);
  for (let i = 0; i < hn; i++) assert(g.addHuman('P' + i + (R(4) ? '' : ' <b>x</b>'), 't' + i).ok);
  g.size = n;
  // lobby noise
  g.act(2, { type: 'size', size: 99 }); g.act(1, { type: 'size', size: n });
  g.act(1, { type: 'level', level: pick(['easy', 'medium', 'hard']) });
  g.act(1, { type: 'timer', sec: pick([0, 30, 45, 60, 120]) });
  if (hn > 1) check(g.act(2, { type: 'start' }).err, 'non-host must not start');
  const st = g.act(1, { type: 'start' });
  check(st.ok, 'host can start', JSON.stringify(st));
  check(g.phase === 'calling', 'calling after start');
  const N = g.n, per = g.per;
  check(per === Math.floor(52 / N) && g.removedCount === 52 - N * per, 'deal sizes');
  const names = g.players.map(p => p.name.toLowerCase());
  check(new Set(names).size === names.length, 'unique names');
  check(g.players.every(p => p.name.length <= 16 && p.name.length > 0), 'name length');

  const playedAll = []; let roundNo = -1, steps = 0, lastScore = {}, prevPhase = '';
  const humansLeft = () => g.humans().length;
  while (g.phase !== 'gameover' && !g.closed && steps++ < 20000) {
    // ---- invariants on every state ----
    const r = g.round;
    if (r.i !== roundNo) {
      roundNo = r.i;
      check(r.cards === per - r.i, 'cards per round', `round ${r.i} cards ${r.cards}`);
      check(r.cut === E.CUT_ORDER[r.i % 5], 'cut order');
      check(r.first === (g.first0 + r.i) % N, 'first caller rotates');
      const all = [].concat(...g.players.map(p => p.hand));
      check(new Set(all).size === all.length && all.length === N * r.cards, 'deal unique + complete');
      check(g.players.every(p => p.hand.length === r.cards), 'equal hands');
      lastScore = {}; g.players.forEach(p => lastScore[p.id] = p.score);
    }
    if (g.phase === 'calling') {
      const order = []; for (let k = 0; k < N; k++) order.push((r.first + k) % N);
      const called = order.filter(i => g.players[i].call !== null);
      check(called.length === order.findIndex(i => g.players[i].call === null) || called.length === N || order.slice(0, called.length).every(i => g.players[i].call !== null), 'calls in rotation');
    }
    const cur = g.players[g.turnIdx];
    // random side events
    const dice = R(400);
    if (dice === 0 && humansLeft()) { const h = pick(g.humans()); g.act(h.id, { type: 'leave' }); check(g.hostId === null || g.byId(g.hostId) && !g.byId(g.hostId).bot, 'host is a human after leave'); continue; }
    if (dice === 1 && humansLeft() > 1) { g.act(g.hostId, { type: 'kick', pid: pick(g.humans().filter(x => x.id !== g.hostId)).id }); check(g.byId(g.hostId) && !g.byId(g.hostId).bot, 'host intact after kick'); continue; }
    if (dice === 2 && humansLeft()) { g.act(pick(g.humans()).id, { type: 'rename', name: pick(['Zed', 'Q', 'a'.repeat(40), '  spaced   out  ']) }); }
    if (dice === 3 && humansLeft()) { g.act(g.hostId, { type: 'level', level: pick(['easy', 'medium', 'hard']) }); }
    if (dice === 4 && humansLeft()) { g.act(pick(g.humans()).id, { type: 'chat', text: '<script>alert(1)</script>' }); }
    if (dice === 5 && humansLeft()) { const before = JSON.stringify(g.snapshot(g.hostId)); const e = g.act(g.hostId, { type: 'size', size: 3 }); check(e.err, 'size locked in game'); }

    if (g.phase === 'calling' || g.phase === 'playing') {
      if (cur.bot || !cur.connected || R(10) < 1) {
        // bot or auto
        g.botAct(cur.id);
      } else {
        // human random play, with illegal attempts first
        const before = JSON.stringify(g.snapshot(cur.id));
        if (g.phase === 'calling') {
          const cs = g.callState();
          const bad = pick([-1, g.round.cards + 1, 'x', cs.forbidden]);
          const e = g.act(cur.id, { type: 'call', n: bad });
          if (e.err) check(JSON.stringify(g.snapshot(cur.id)) === before, 'illegal call changed state');
          const wrong = g.players.find(p => p.id !== cur.id); if (wrong && !wrong.bot) check(g.act(wrong.id, { type: 'call', n: 0 }).err, 'call out of turn rejected');
          let v; do { v = R(g.round.cards + 1); } while (v === cs.forbidden);
          check(g.act(cur.id, { type: 'call', n: v }).ok, 'legal call accepted');
        } else {
          const legal = E.legalCards(cur.hand, g.led);
          const illegal = cur.hand.filter(c => legal.indexOf(c) < 0);
          if (illegal.length) { const e = g.act(cur.id, { type: 'play', card: pick(illegal) }); check(e.err && JSON.stringify(g.snapshot(cur.id)) === before, 'illegal (not following suit) play rejected'); }
          check(g.act(cur.id, { type: 'play', card: 'S99' }).err, 'card not held rejected');
          const c = pick(legal);
          const ledBefore = g.led, trickLen = g.trick.length;
          const ok = g.act(cur.id, { type: 'play', card: c });
          check(ok.ok, 'legal play accepted');
          if (ledBefore && suitOf(c) !== ledBefore) check(!cur.hand.concat([c]).some(x => suitOf(x) === ledBefore && x !== c) , 'followed suit when able');
        }
      }
    } else if (g.phase === 'trickdone') {
      const w = refWinner(g.trick, g.round.cut);
      check(g.trickWinner === w, 'trick winner', `got ${g.trickWinner} want ${w}`);
      check(g.trick.length === N && new Set(g.trick.map(t => t.pid)).size === N, 'trick has one card per player');
      clearTimeout(g.ttimer); g.afterTrick();
      if (g.phase === 'playing') check(g.players[g.turnIdx].id === w, 'winner leads next hand');
    } else if (g.phase === 'roundover') {
      const h = g.history[g.history.length - 1];
      let sumMade = 0;
      g.players.forEach(p => { const x = h.res[p.id]; sumMade += x.made; check(x.pts === (x.made === x.call ? 10 + x.call : 0), 'scoring'); check(p.score === lastScore[p.id] + x.pts, 'score total'); });
      check(sumMade === h.cards, 'tricks won add up to cards', `${sumMade} vs ${h.cards}`);
      const sum = g.players.reduce((s, p) => s + p.call, 0);
      check(sum !== h.cards, 'calls never total the cards', `${sum} vs ${h.cards}`);
      const who = humansLeft() ? pick(g.humans()) : g.players[0];
      const e = g.act(who.id, { type: 'next' });
      check(e.ok || !humansLeft(), 'next round', JSON.stringify(e));
      if (humansLeft() === 0 && g.phase === 'roundover') g.startRound(g.round.i + 1);
    } else if (g.phase === 'lobby') break;
  }
  if (g.phase === 'gameover') {
    check(g.history.length === per, 'played every round', `${g.history.length} vs ${per}`);
    check(g.history[g.history.length - 1].cards === 1, 'last round is 1 card');
    const max = Math.max(...g.players.map(p => p.score));
    check(g.winners.length >= 1 && g.winners.every(id => g.byId(id).score === max) && g.players.filter(p => p.score === max).length === g.winners.length, 'winners = top score');
    if (humansLeft()) {
      check(g.act(g.hostId, { type: 'again' }).ok, 'play again');
      check(g.phase === 'lobby' && g.players.every(p => !p.bot && p.score === 0), 'back to lobby, bots cleared, scores reset');
      check(g.act(g.hostId, { type: 'start' }).ok || g.humans().length === 1 && g.size >= 3, 'start after play again', JSON.stringify(g.snapshot(g.hostId).err));
    }
  } else check(g.closed || steps >= 20000 ? g.closed : false, 'game ended or room closed', g.phase + ' steps=' + steps);
  g.destroy();
  return steps;
}

const games = parseInt(process.argv[2] || '1500', 10);
const t0 = Date.now(); let total = 0;
for (let i = 0; i < games; i++) {
  try { total += oneGame(i); } catch (e) { fails.push('EXCEPTION ' + (e && e.stack || e)); if (fails.length > 5) break; }
}
if (fails.length) { console.log('FUZZ FAILURES (' + fails.length + ')'); const seen = {}; fails.forEach(f => { const k = f.slice(0, 80); seen[k] = (seen[k] || 0) + 1; }); Object.keys(seen).forEach(k => console.log(seen[k] + 'x ' + k)); process.exit(1); }
console.log('fuzz ok: ' + games + ' games, ' + total + ' steps, ' + (Date.now() - t0) + ' ms');
