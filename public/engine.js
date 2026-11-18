(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUITS = ['S', 'H', 'C', 'D'];
  var SUIT_NAME = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
  var CUT_ORDER = ['S', 'H', 'C', 'D', null];
  var BOT_NAMES = ['Ace', 'Bishop', 'Casino', 'Dealer', 'Ember', 'Fox', 'Gambit', 'Hawk', 'Ivory', 'Joker'];

  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function newDeck() {
    var d = [];
    SUITS.forEach(function (s) { for (var r = 2; r <= 14; r++) d.push(s + r); });
    return d;
  }
  function suitOf(c) { return c[0]; }
  function rankOf(c) { return +c.slice(1); }
  function sortHand(h) {
    return h.slice().sort(function (a, b) {
      return SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankOf(b) - rankOf(a);
    });
  }
  function legalCards(hand, led) {
    if (!led) return hand.slice();
    var f = hand.filter(function (c) { return suitOf(c) === led; });
    return f.length ? f : hand.slice();
  }
  // trick: [{pid, card}] in play order. Highest cut card wins; otherwise highest of the led suit.
  function trickWinner(trick, cut) {
    var led = suitOf(trick[0].card);
    var pool = cut ? trick.filter(function (t) { return suitOf(t.card) === cut; }) : [];
    if (!pool.length) pool = trick.filter(function (t) { return suitOf(t.card) === led; });
    var best = pool[0];
    pool.forEach(function (t) { if (rankOf(t.card) > rankOf(best.card)) best = t; });
    return best.pid;
  }

  var Bot = {
    estimate: function (hand, cut, n) {
      var e = 0;
      hand.forEach(function (c) {
        var r = rankOf(c), p;
        if (suitOf(c) === cut) p = r === 14 ? 0.95 : r === 13 ? 0.85 : r === 12 ? 0.7 : r === 11 ? 0.55 : r >= 9 ? 0.4 : r >= 6 ? 0.28 : 0.18;
        else p = r === 14 ? 0.8 : r === 13 ? 0.42 : r === 12 ? 0.2 : r === 11 ? 0.08 : 0.02;
        e += p;
      });
      return e * Math.max(0.55, 1 - (n - 4) * 0.06);
    },
    call: function (hand, cut, n, cards, sumSoFar, isLast) {
      var est = this.estimate(hand, cut, n);
      var c = Math.round(est + (Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0));
      c = Math.max(0, Math.min(cards, c));
      if (isLast && sumSoFar + c === cards) {
        var alts = [c - 1, c + 1].filter(function (x) { return x >= 0 && x <= cards; });
        alts.sort(function (a, b) { return Math.abs(a - est) - Math.abs(b - est); });
        c = alts[0];
      }
      return c;
    },
    play: function (hand, led, trick, cut, need) {
      var legal = legalCards(hand, led);
      var val = function (c) { return rankOf(c) + (suitOf(c) === cut ? 20 : 0); };
      var asc = function (a, b) { return val(a) - val(b); };
      var desc = function (a, b) { return val(b) - val(a); };
      if (!led) {
        var s = legal.slice().sort(desc);
        return need > 0 ? s[0] : s[s.length - 1];
      }
      var wins = function (c) { return trickWinner(trick.concat([{ pid: 'me', card: c }]), cut) === 'me'; };
      var w = legal.filter(wins), l = legal.filter(function (c) { return !wins(c); });
      if (need > 0) return w.length ? w.sort(asc)[0] : legal.slice().sort(asc)[0];
      return l.length ? l.sort(desc)[0] : legal.slice().sort(asc)[0];
    }
  };

  function cleanName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  function Game(code, opts) {
    opts = opts || {};
    this.code = code;
    this.fast = !!opts.fast;
    this.players = [];
    this.size = 4;
    this.phase = 'lobby';
    this.hostId = null;
    this.nextId = 1;
    this.history = [];
    this.round = null;
    this.turnIdx = 0;
    this.trick = [];
    this.led = null;
    this.trickWinner = null;
    this.winners = [];
    this.timer = null;
    this.ttimer = null;
    this.schedKey = null;
    this.timerSec = 0;          // turn timer: 0 = off, else 30/45/60/120
    this.timerScale = 1;        // tests shrink this
    this.turnEnd = null;
    this.chat = [];
    this.chatSeq = 0;
    this.closed = false;
    this.touched = Date.now();
    this.onChange = function () {};
    this.onKick = function () {};
  }

  Game.prototype.humans = function () { return this.players.filter(function (p) { return !p.bot; }); };
  Game.prototype.byId = function (id) { return this.players.filter(function (p) { return p.id === id; })[0]; };
  Game.prototype.byToken = function (t) { return t ? this.players.filter(function (p) { return p.token === t; })[0] : undefined; };

  Game.prototype.uniqueName = function (name, exceptId) {
    var base = cleanName(name), n = base, k = 2, self = this;
    var taken = function (x) {
      return self.players.some(function (p) { return p.id !== exceptId && p.name.toLowerCase() === x.toLowerCase(); });
    };
    while (taken(n)) { n = base.slice(0, 14) + ' ' + k; k++; }
    return n;
  };

  Game.prototype.addHuman = function (name, token) {
    if (this.phase !== 'lobby') return { err: 'That game has already started' };
    if (this.humans().length >= 8) return { err: 'Table is full' };
    if (!cleanName(name)) return { err: 'Enter your name' };
    var p = { id: this.nextId++, name: this.uniqueName(name), bot: false, token: token || null, connected: true, score: 0, call: null, made: 0, hand: [] };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    if (this.humans().length > this.size) this.size = this.humans().length;
    this.emit();
    return { ok: true, pid: p.id };
  };

  Game.prototype.setConnected = function (pid, v) {
    var p = this.byId(pid);
    if (!p || p.bot || p.connected === v) return;
    p.connected = v;
    this.emit();
  };

  Game.prototype.emit = function () {
    this.touched = Date.now();
    this.schedule();
    this.onChange();
  };

  Game.prototype.reassignHost = function () {
    var h = this.humans().filter(function (p) { return p.connected; })[0] || this.humans()[0];
    this.hostId = h ? h.id : null;
    if (!h) this.closed = true;
  };

  Game.prototype.act = function (pid, a) {
    var p = this.byId(pid);
    if (!p || !a) return { err: 'Not in this room' };
    var isHost = pid === this.hostId;
    switch (a.type) {
      case 'rename': {
        if (!cleanName(a.name)) return { err: 'Enter a name' };
        p.name = this.uniqueName(a.name, pid);
        this.emit();
        return { ok: true };
      }
      case 'size': {
        if (!isHost || this.phase !== 'lobby') return { err: 'Only the host can do that' };
        var want = parseInt(a.size, 10);
        if (isNaN(want)) return { err: 'Bad size' };
        this.size = Math.max(3, this.humans().length, Math.min(8, want));
        this.emit();
        return { ok: true };
      }
      case 'timer': {
        if (!isHost) return { err: 'Only the host can do that' };
        var ts = parseInt(a.sec, 10);
        if ([0, 30, 45, 60, 120].indexOf(ts) < 0) return { err: 'Bad timer' };
        this.timerSec = ts;
        this.emit();
        return { ok: true };
      }
      case 'chat': {
        var text = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!text) return { err: 'Type a message first' };
        var now = Date.now();
        if (p.lastChat && now - p.lastChat < 350) return { err: 'Slow down' };
        p.lastChat = now;
        this.pushChat(p.id, p.name, text, false);
        this.emit();
        return { ok: true };
      }
      case 'kick': {
        if (!isHost) return { err: 'Only the host can do that' };
        var t = this.byId(a.pid);
        if (!t || t.bot || t.id === pid) return { err: 'Cannot remove that player' };
        this.removeHuman(t, true);
        return { ok: true };
      }
      case 'leave': {
        this.removeHuman(p, false);
        return { ok: true };
      }
      case 'start': {
        if (!isHost || this.phase !== 'lobby') return { err: 'Only the host can start' };
        var n = Math.max(this.size, this.humans().length);
        if (n < 3) return { err: 'Need at least 3 players. Add a bot.' };
        this.begin();
        return { ok: true };
      }
      case 'call': return this.doCall(p, a.n);
      case 'play': return this.doPlay(p, a.card);
      case 'next': {
        if (this.phase !== 'roundover') return { err: 'Not now' };
        this.startRound(this.round.i + 1);
        return { ok: true };
      }
      case 'again': {
        if (!isHost || this.phase !== 'gameover') return { err: 'Only the host can do that' };
        this.players = this.players.filter(function (x) { return !x.bot; });
        this.players.forEach(function (x) { x.score = 0; x.call = null; x.made = 0; x.hand = []; });
        this.history = []; this.round = null; this.winners = []; this.trick = []; this.led = null;
        this.schedKey = null; this.turnEnd = null;
        this.phase = 'lobby';
        this.emit();
        return { ok: true };
      }
    }
    return { err: 'Unknown action' };
  };

  Game.prototype.pushChat = function (pid, name, text, sys) {
    this.chat.push({ id: ++this.chatSeq, pid: pid, name: name, text: text, sys: !!sys });
    if (this.chat.length > 80) this.chat.splice(0, this.chat.length - 80);
  };

  Game.prototype.removeHuman = function (t, kicked) {
    var token = t.token;
    if (this.phase === 'lobby') {
      this.players = this.players.filter(function (x) { return x.id !== t.id; });
    } else {
      t.bot = true; t.token = null; t.connected = true;
    }
    if (this.hostId === t.id) this.reassignHost();
    this.onKick(t.id, token, kicked);
    if (!this.humans().length) this.closed = true;
    this.emit();
  };

  Game.prototype.begin = function () {
    var humans = this.humans();
    var n = Math.max(this.size, humans.length);
    var used = {};
    humans.forEach(function (p) { used[p.name.toLowerCase()] = 1; });
    var pool = shuffle(BOT_NAMES.slice()).filter(function (x) { return !used[x.toLowerCase()]; });
    var bots = [];
    for (var i = 0; i < n - humans.length; i++) {
      bots.push({ id: this.nextId++, name: pool[i] || ('Bot ' + (i + 1)), bot: true, token: null, connected: true, score: 0, call: null, made: 0, hand: [] });
    }
    this.players = shuffle(humans.concat(bots));
    this.players.forEach(function (p) { p.score = 0; });
    this.n = n;
    this.per = Math.floor(52 / n);
    this.removedCount = 52 - n * this.per;
    this.first0 = rnd(n);
    this.history = [];
    this.winners = [];
    this.startRound(0);
  };

  Game.prototype.startRound = function (i) {
    var n = this.n, cards = this.per - i;
    var d = shuffle(newDeck());
    this.players.forEach(function (p, k) {
      p.hand = sortHand(d.slice(k * cards, (k + 1) * cards));
      p.call = null; p.made = 0;
    });
    var first = (this.first0 + i) % n;
    this.round = { i: i, cards: cards, cut: CUT_ORDER[i % 5], first: first };
    this.phase = 'calling';
    this.turnIdx = first;
    this.trick = []; this.led = null; this.trickWinner = null;
    this.emit();
  };

  Game.prototype.callState = function () {
    var called = this.players.filter(function (p) { return p.call !== null; });
    var sum = called.reduce(function (s, p) { return s + p.call; }, 0);
    var isLast = called.length === this.n - 1;
    var forbidden = isLast ? this.round.cards - sum : null;
    if (forbidden !== null && (forbidden < 0 || forbidden > this.round.cards)) forbidden = null;
    return { sum: sum, isLast: isLast, forbidden: forbidden };
  };

  Game.prototype.doCall = function (p, num) {
    if (this.phase !== 'calling' || this.players[this.turnIdx].id !== p.id) return { err: 'Not your turn' };
    var v = parseInt(num, 10);
    if (isNaN(v) || v < 0 || v > this.round.cards) return { err: 'Call between 0 and ' + this.round.cards };
    var cs = this.callState();
    if (cs.forbidden === v) return { err: "Last caller can't make the calls total " + this.round.cards };
    p.call = v;
    if (this.players.every(function (x) { return x.call !== null; })) {
      this.phase = 'playing';
      this.turnIdx = this.round.first;
    } else {
      this.turnIdx = (this.turnIdx + 1) % this.n;
    }
    this.emit();
    return { ok: true };
  };

  Game.prototype.doPlay = function (p, card) {
    if (this.phase !== 'playing' || this.players[this.turnIdx].id !== p.id) return { err: 'Not your turn' };
    if (p.hand.indexOf(card) < 0) return { err: 'You do not hold that card' };
    if (legalCards(p.hand, this.led).indexOf(card) < 0) return { err: 'You must follow the led suit' };
    p.hand = p.hand.filter(function (c) { return c !== card; });
    if (!this.trick.length) this.led = suitOf(card);
    this.trick.push({ pid: p.id, card: card });
    if (this.trick.length < this.n) {
      this.turnIdx = (this.turnIdx + 1) % this.n;
      this.emit();
      return { ok: true };
    }
    var wid = trickWinner(this.trick, this.round.cut);
    var w = this.byId(wid);
    w.made++;
    this.trickWinner = wid;
    this.phase = 'trickdone';
    this.turnIdx = this.players.indexOf(w);
    this.emit();
    var self = this;
    // After the last hand of a round the table is held longer before the Screen opens.
    var lastHand = p.hand.length === 0;
    clearTimeout(this.ttimer);
    this.ttimer = setTimeout(function () { self.afterTrick(); }, this.fast ? 1 : (lastHand ? 4000 : 1600));
    return { ok: true };
  };

  Game.prototype.afterTrick = function () {
    if (this.phase !== 'trickdone') return;
    if (this.players[0].hand.length === 0) { this.endRound(); return; }
    this.trick = []; this.led = null; this.trickWinner = null;
    this.phase = 'playing';
    this.emit();
  };

  Game.prototype.endRound = function () {
    var res = {};
    this.players.forEach(function (p) {
      var pts = p.made === p.call ? 10 + p.call : 0;
      p.score += pts;
      res[p.id] = { call: p.call, made: p.made, pts: pts };
    });
    this.history.push({ i: this.round.i, cards: this.round.cards, cut: this.round.cut, res: res });
    this.trick = []; this.led = null; this.trickWinner = null;
    if (this.round.i >= this.per - 1) {
      var max = Math.max.apply(null, this.players.map(function (p) { return p.score; }));
      this.winners = this.players.filter(function (p) { return p.score === max; }).map(function (p) { return p.id; });
      this.phase = 'gameover';
    } else {
      this.phase = 'roundover';
    }
    this.emit();
  };

  // Arms one timer per turn. Chat, renames etc. call emit() too, so the timer is only
  // re-armed when the turn itself (or who is acting, or the timer setting) changes.
  Game.prototype.schedule = function () {
    var live = this.phase === 'calling' || this.phase === 'playing';
    var cur = live ? this.players[this.turnIdx] : null;
    if (!cur) {
      clearTimeout(this.timer); this.timer = null; this.schedKey = null; this.turnEnd = null;
      return;
    }
    var key = [this.phase, this.round.i, this.turnIdx, this.trick.length, cur.id, cur.bot ? 1 : 0, cur.connected ? 1 : 0, this.timerSec].join('|');
    if (key === this.schedKey && this.timer) return;
    clearTimeout(this.timer); this.timer = null;
    this.schedKey = key; this.turnEnd = null;
    var delay, timed = false;
    if (cur.bot) delay = this.fast ? 1 : 600 + rnd(500);
    else if (!cur.connected) delay = this.fast ? 1 : (this.autoMs || 25000);
    else if (this.timerSec) { delay = this.timerSec * 1000 * this.timerScale; timed = true; }
    else return;
    if (timed) this.turnEnd = Date.now() + delay;
    var self = this;
    this.timer = setTimeout(function () {
      self.timer = null; self.schedKey = null;
      if (timed && self.players[self.turnIdx] === cur && !cur.bot) {
        self.pushChat(null, '', 'Time’s up for ' + cur.name + ' — played automatically', true);
      }
      self.botAct(cur.id);
    }, delay);
  };

  Game.prototype.botAct = function (pid) {
    var cur = this.players[this.turnIdx];
    if (!cur || cur.id !== pid) return;
    if (this.phase === 'calling') {
      var cs = this.callState();
      var n = Bot.call(cur.hand, this.round.cut, this.n, this.round.cards, cs.sum, cs.isLast);
      this.doCall(cur, n);
    } else if (this.phase === 'playing') {
      var c = Bot.play(cur.hand, this.led, this.trick, this.round.cut, cur.call - cur.made);
      this.doPlay(cur, c);
    }
  };

  Game.prototype.destroy = function () {
    clearTimeout(this.timer); clearTimeout(this.ttimer);
  };

  Game.prototype.snapshot = function (pid) {
    var me = this.byId(pid);
    var inGame = this.phase !== 'lobby';
    var humans = this.humans();
    var n = inGame ? this.n : Math.max(this.size, humans.length);
    var per = Math.floor(52 / n);
    var turn = (this.phase === 'calling' || this.phase === 'playing' || this.phase === 'trickdone') && this.players[this.turnIdx]
      ? this.players[this.turnIdx].id : null;
    var s = {
      code: this.code, phase: this.phase, me: pid, host: this.hostId,
      size: this.size, n: n, per: per, removed: 52 - n * per,
      botCount: inGame ? this.players.filter(function (p) { return p.bot; }).length : n - humans.length,
      players: this.players.map(function (p) {
        return { id: p.id, name: p.name, bot: p.bot, connected: p.connected, call: p.call, made: p.made, score: p.score };
      }),
      history: this.history, round: this.round, turn: turn, led: this.led,
      trick: this.trick, trickWinner: this.trickWinner, winners: this.winners,
      hand: me && inGame ? me.hand : [], legal: [], callInfo: null,
      timerSec: this.timerSec,
      turnLeft: this.turnEnd && (this.phase === 'calling' || this.phase === 'playing') ? Math.max(0, this.turnEnd - Date.now()) : null,
      chat: this.chat.slice(-50)
    };
    if (me && this.phase === 'playing' && turn === pid) s.legal = legalCards(me.hand, this.led);
    if (me && this.phase === 'calling' && turn === pid) s.callInfo = this.callState();
    return s;
  };

  return {
    Game: Game, Bot: Bot, SUITS: SUITS, SUIT_NAME: SUIT_NAME, CUT_ORDER: CUT_ORDER,
    suitOf: suitOf, rankOf: rankOf, legalCards: legalCards, trickWinner: trickWinner,
    newDeck: newDeck, shuffle: shuffle, cleanName: cleanName
  };
});
