'use strict';
const assert = require('assert');
const E = require('../public/engine.js');
const { Game } = E;

function play(nHumans, size) {
  return new Promise((resolve, reject) => {
    const g = new Game('TEST', { fast: true });
    for (let i = 0; i < nHumans; i++) assert(g.addHuman('P' + i, 't' + i).ok);
    g.size = size;
    // Rule checks happen inside the observer
    const seenRounds = new Set();
    g.onChange = () => {
      try {
        if (g.phase === 'roundover' || g.phase === 'gameover') {
          const h = g.history[g.history.length - 1];
          if (!seenRounds.has(h.i)) {
            seenRounds.add(h.i);
            const sumMade = Object.values(h.res).reduce((s, r) => s + r.made, 0);
            assert.strictEqual(sumMade, h.cards, 'hands made must equal cards in round');
            Object.values(h.res).forEach(r => assert.strictEqual(r.pts, r.made === r.call ? 10 + r.call : 0));
            // calls never total cards
            const sumCalls = Object.values(h.res).reduce((s, r) => s + r.call, 0);
            assert.notStrictEqual(sumCalls, h.cards, 'calls must not total cards');
          }
          if (g.phase === 'gameover') {
            assert.strictEqual(g.history.length, g.per);
            assert(g.winners.length >= 1);
            g.destroy();
            return resolve(g);
          }
          setImmediate(() => g.act(g.hostId, { type: 'next' }));
          return;
        }
        // human players are driven by bot logic through act()
        if (g.phase === 'calling' || g.phase === 'playing') {
          const cur = g.players[g.turnIdx];
          if (!cur.bot) setImmediate(() => {
            if (g.players[g.turnIdx] !== cur) return;
            if (g.phase === 'calling') {
              const cs = g.callState();
              // illegal call check for last caller
              if (cs.forbidden !== null) assert(g.act(cur.id, { type: 'call', n: cs.forbidden }).err);
              g.act(cur.id, { type: 'call', n: E.Bot.call(cur.hand, g.round.cut, g.n, g.round.cards, cs.sum, cs.isLast) });
            } else if (g.phase === 'playing') {
              const legal = E.legalCards(cur.hand, g.led);
              const illegal = cur.hand.filter(c => !legal.includes(c))[0];
              if (illegal) assert(g.act(cur.id, { type: 'play', card: illegal }).err, 'must follow suit');
              g.act(cur.id, { type: 'play', card: E.Bot.play(cur.hand, g.led, g.trick, g.round.cut, cur.call - cur.made) });
            }
          });
        }
      } catch (e) { reject(e); }
    };
    assert(g.act(g.hostId, { type: 'start' }).ok);
  });
}

(async () => {
  // trick resolution
  assert.strictEqual(E.trickWinner([{ pid: 1, card: 'D5' }, { pid: 2, card: 'C14' }, { pid: 3, card: 'D9' }], null), 3);
  assert.strictEqual(E.trickWinner([{ pid: 1, card: 'D14' }, { pid: 2, card: 'S2' }, { pid: 3, card: 'S9' }], 'S'), 3);
  assert.strictEqual(E.trickWinner([{ pid: 1, card: 'D14' }, { pid: 2, card: 'C14' }], 'S'), 1);
  assert.strictEqual(E.trickWinner([{ pid: 1, card: 'S3' }, { pid: 2, card: 'S12' }], 'S'), 2);
  // follow suit
  assert.deepStrictEqual(E.legalCards(['D2', 'S3'], 'D'), ['D2']);
  assert.deepStrictEqual(E.legalCards(['H2', 'S3'], 'D').sort(), ['H2', 'S3']);

  const cfg = [[1, 3], [1, 4], [2, 5], [1, 6], [3, 7], [1, 8], [8, 8]];
  for (const [h, n] of cfg) {
    const g = await play(h, n);
    const per = Math.floor(52 / n);
    assert.strictEqual(g.per, per);
    assert.strictEqual(g.removedCount, 52 - n * per);
    console.log('ok  ' + n + ' players (' + h + ' human): ' + per + ' rounds, winners ' + g.winners.length + ', top score ' + Math.max(...g.players.map(p => p.score)));
  }
  // lobby rules
  const g = new Game('X', { fast: true });
  assert(g.addHuman('', 'a').err, 'name required');
  g.addHuman('Ishan', 'a'); g.addHuman('ishan', 'b');
  assert.strictEqual(g.players[1].name, 'ishan 2');
  g.act(g.hostId, { type: 'size', size: 2 });
  assert.strictEqual(g.size, 3, 'min 3');
  g.act(g.hostId, { type: 'size', size: 99 });
  assert.strictEqual(g.size, 8, 'max 8');
  assert(g.act(2, { type: 'start' }).err, 'only host starts');
  g.destroy();

  // chat + timer setting rules
  const c = new Game('C', { fast: true });
  c.addHuman('Ishan', 'a'); c.addHuman('Atul', 'b');
  assert(c.act(1, { type: 'chat', text: '   ' }).err, 'empty chat rejected');
  assert(c.act(1, { type: 'chat', text: 'x'.repeat(500) }).ok);
  assert.strictEqual(c.chat[0].text.length, 160, 'chat capped at 160');
  assert(c.act(1, { type: 'chat', text: 'again' }).err, 'rate limited');
  assert(c.act(2, { type: 'chat', text: 'hi' }).ok);
  assert(c.act(2, { type: 'timer', sec: 30 }).err, 'only host sets timer');
  assert(c.act(1, { type: 'timer', sec: 20 }).err, 'timer values validated');
  assert(c.act(1, { type: 'timer', sec: 15 }).err, '15s no longer offered');
  assert(c.act(1, { type: 'timer', sec: 120 }).ok, '2 min allowed');
  assert(c.act(1, { type: 'timer', sec: 45 }).ok);
  assert.strictEqual(c.snapshot(2).timerSec, 45);
  assert.strictEqual(c.snapshot(2).chat.length, 2);
  c.destroy();

  // chat must not restart a running turn timer
  await new Promise((resolve, reject) => {
    const t = new Game('T', { fast: false });
    t.autoMs = 99999;
    t.addHuman('Solo', 'a'); t.size = 3;
    assert(t.act(1, { type: 'timer', sec: 30 }).ok);
    let done = false;
    t.onChange = () => {
      try {
        if (done || (t.phase !== 'calling' && t.phase !== 'playing')) return;
        if (t.players[t.turnIdx].bot) return;
        done = true;
        const end = t.turnEnd;
        assert(end && end > Date.now() + 29000, 'human turn is timed (30s)');
        assert(t.snapshot(1).turnLeft > 29000);
        setTimeout(() => {
          t.act(1, { type: 'chat', text: 'hello' });
          assert.strictEqual(t.turnEnd, end, 'chat did not reset the timer');
          t.destroy(); resolve();
        }, 30);
      } catch (e) { reject(e); }
    };
    t.act(1, { type: 'start' });
  });

  // timer expiry: a bot plays for the human and a notice is posted
  await new Promise((resolve, reject) => {
    const t = new Game('E', { fast: true });
    t.addHuman('Solo', 'a'); t.size = 3;
    t.timerSec = 15; t.timerScale = 0.002;   // 30 ms
    t.act(1, { type: 'start' });
    setTimeout(() => {
      try {
        assert(t.chat.some(m => m.sys && /Time’s up for Solo/.test(m.text)), 'expiry notice posted');
        assert(t.history.length >= 1 || t.phase !== 'calling', 'game progressed without the human');
        t.destroy(); resolve();
      } catch (e) { reject(e); }
    }, 700);
  });

  // table is held ~4 s after the last hand of a round (1.6 s between ordinary hands)
  {
    const delays = [];
    const realST = global.setTimeout;
    global.setTimeout = function (fn, ms) {
      if (typeof fn === 'function' && /afterTrick/.test(fn.toString())) delays.push(ms);
      return realST.apply(this, arguments);
    };
    const h = new Game('H', { fast: false });
    h.addHuman('A', 'a'); h.addHuman('B', 'b'); h.addHuman('C', 'c');
    h.act(1, { type: 'start' });
    let guard = 0;
    while (h.phase !== 'roundover' && guard++ < 500) {
      const cur = h.players[h.turnIdx];
      if (h.phase === 'calling') { const cs = h.callState(); h.act(cur.id, { type: 'call', n: E.Bot.call(cur.hand, h.round.cut, h.n, h.round.cards, cs.sum, cs.isLast) }); }
      else if (h.phase === 'playing') h.act(cur.id, { type: 'play', card: E.Bot.play(cur.hand, h.led, h.trick, h.round.cut, cur.call - cur.made) });
      else if (h.phase === 'trickdone') h.afterTrick();
    }
    global.setTimeout = realST;
    assert.strictEqual(h.phase, 'roundover');
    const hands = h.round.cards;
    assert.strictEqual(delays.length, hands, 'one pause per hand');
    assert(delays.every(d => d === 6000), 'every hand is held 6 s, the last one too');
    h.destroy();
  }

  // bot difficulty: default, host-only setting, validation, snapshot, seq
  {
    const d = new Game('L', { fast: true });
    d.addHuman('Host', 'a'); d.addHuman('Guest', 'b');
    assert.strictEqual(d.snapshot(1).botLevel, 'medium', 'default level is Medium');
    assert(d.act(2, { type: 'level', level: 'hard' }).err, 'only host sets level');
    assert(d.act(1, { type: 'level', level: 'pro' }).err, 'levels validated');
    const s0 = d.snapshot(1).seq;
    assert(d.act(1, { type: 'level', level: 'hard' }).ok);
    assert.strictEqual(d.snapshot(2).botLevel, 'hard');
    assert(d.snapshot(1).seq > s0, 'seq advances on every change');
    d.destroy();
  }
  // a timed-out human is auto-played at Medium even when bots are Hard
  await new Promise((resolve, reject) => {
    const t = new Game('M', { fast: true });
    t.addHuman('Solo', 'a'); t.size = 3; t.botLevel = 'hard';
    t.timerSec = 30; t.timerScale = 0.002;
    const realCall = E.Bot.call, seen = [];
    E.Bot.call = function () { seen.push({ lvl: arguments[6], pid: t.players[t.turnIdx] && t.players[t.turnIdx].bot }); return realCall.apply(this, arguments); };
    t.act(1, { type: 'start' });
    setTimeout(() => {
      E.Bot.call = realCall;
      try {
        assert(seen.some(x => x.pid === false && x.lvl === 'medium'), 'human autoplay uses medium');
        assert(seen.some(x => x.pid === true && x.lvl === 'hard'), 'bots use the room level');
        t.destroy(); resolve();
      } catch (e) { reject(e); }
    }, 700);
  });
  // Easy < Medium < Hard over many bot-vs-bot games
  {
    const { tournament } = require('./botsim.js');
    const r = tournament(['easy', 'medium', 'hard', 'medium'], 400);
    assert(r.hard.avg > r.medium.avg + 3, 'hard beats medium (' + r.hard.avg.toFixed(1) + ' vs ' + r.medium.avg.toFixed(1) + ')');
    assert(r.medium.avg > r.easy.avg + 5, 'medium beats easy (' + r.medium.avg.toFixed(1) + ' vs ' + r.easy.avg.toFixed(1) + ')');
    console.log('ok   bot levels: easy ' + r.easy.avg.toFixed(1) + ' < medium ' + r.medium.avg.toFixed(1) + ' < hard ' + r.hard.avg.toFixed(1));
  }

  console.log('all tests passed');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
