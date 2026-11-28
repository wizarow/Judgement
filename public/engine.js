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

  // ---- Bot brains: easy / medium (the original bot) / hard ----
  var P_NON = [0.8, 0.42, 0.2, 0.08, 0.02];
  var P_CUT = [0.95, 0.85, 0.7, 0.55, 0.4, 0.4, 0.28, 0.28, 0.28, 0.18];
  var A_OWN = 0.5;   // how much of my own higher cards count as cover for the card below
  function interp(tab, u) {
    if (u <= 0) return tab[0];
    var i = Math.floor(u), f = u - i;
    var a = tab[Math.min(i, tab.length - 1)], b = tab[Math.min(i + 1, tab.length - 1)];
    return a + (b - a) * f;
  }
  function seenSet(hand, played) {
    var s = {};
    hand.forEach(function (c) { s[c] = 1; });
    (played || []).forEach(function (c) { s[c] = 1; });
    return s;
  }
  // higher cards of the same suit: unseen ones (could be anywhere) and ones I hold myself
  function higherInfo(card, hand, seen) {
    var s = suitOf(card), r = rankOf(card), u = 0, own = 0;
    for (var x = r + 1; x <= 14; x++) {
      var c = s + x;
      if (hand.indexOf(c) >= 0) own++; else if (!seen[c]) u++;
    }
    return { u: u, own: own };
  }
  function winProb(card, hand, seen, cut) {
    var h = higherInfo(card, hand, seen);
    return interp(suitOf(card) === cut ? P_CUT : P_NON, h.u + A_OWN * h.own);
  }
  function fixLast(c, target, cards, sum, isLast) {
    c = Math.max(0, Math.min(cards, c));
    if (isLast && sum + c === cards) {
      var alts = [c - 1, c + 1].filter(function (x) { return x >= 0 && x <= cards; });
      alts.sort(function (a, b) { return Math.abs(a - target) - Math.abs(b - target); });
      c = alts[0];
    }
    return c;
  }

  // Hard-bot call estimate: least-squares fit of tricks made on hand features, from bot-vs-bot rounds.
  // Keys: players -> [no cut, cut]. Order matches Bot.features.
  var HARD_COEF = {
    3: [[0.923, 0.81, 0.736, 0.606, 0.205, -0.144, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.75, 0.679, 0.515, 0.379, 0.113, -0.145, 1.203, 1.038, 0.91, 0.804, 0.764, 0.718, 0.65, 0.62, -0.14, 0.014, -0.064]],
    4: [[0.908, 0.729, 0.554, 0.388, 0.112, -0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.679, 0.462, 0.305, 0.198, 0.028, -0.075, 1.043, 0.811, 0.676, 0.577, 0.508, 0.436, 0.36, 0.293, 0.119, 0.082, 0.011]],
    5: [[0.902, 0.581, 0.375, 0.288, 0.081, -0.086, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.597, 0.328, 0.174, 0.097, -0.01, -0.029, 0.952, 0.644, 0.513, 0.392, 0.319, 0.25, 0.176, 0.095, 0.306, 0.115, 0.046]],
    6: [[0.853, 0.469, 0.347, 0.242, 0.048, -0.074, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.483, 0.23, 0.114, 0.047, -0.013, -0.021, 0.949, 0.589, 0.441, 0.333, 0.244, 0.168, 0.105, 0.022, 0.377, 0.105, 0.036]],
    7: [[0.733, 0.401, 0.286, 0.199, 0.052, -0.098, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.401, 0.169, 0.08, 0.029, -0.013, -0.02, 0.912, 0.517, 0.362, 0.272, 0.182, 0.101, 0.03, -0.032, 0.428, 0.109, 0.037]],
    8: [[0.599, 0.286, 0.247, 0.19, 0.041, -0.063, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.312, 0.133, 0.058, 0.017, -0.01, -0.019, 0.876, 0.489, 0.321, 0.222, 0.133, 0.066, -0.012, -0.077, 0.46, 0.106, 0.033]],
  };

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
    // Hand features the Hard estimate is fitted on (counts of cards by how many higher cards are still out)
    features: function (hand, cut) {
      var f = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], seen = seenSet(hand, []);
      var cutBk = [0, 1, 2, 3, 4, 5, 5, 6, 6, 7];   // u -> bucket for cut cards (u>=9 -> 7)
      hand.forEach(function (c) {
        var h = higherInfo(c, hand, seen);
        if (suitOf(c) === cut) {
          f[5 + 1 + (h.u >= 9 ? 7 : cutBk[h.u])] += 1;
          if (h.u > 0 && h.own > 0) f[14] += 1;
        } else {
          f[Math.min(h.u, 4)] += 1;
          if (h.u > 0 && h.own > 0) f[5] += 1;
        }
      });
      if (cut) {
        var nCut = hand.filter(function (c) { return suitOf(c) === cut; }).length;
        SUITS.forEach(function (st) {
          if (st === cut) return;
          var k = hand.filter(function (c) { return suitOf(c) === st; }).length;
          if (k === 0 && nCut) f[15] += 1;
          if (k === 1 && nCut) f[16] += 1;
        });
      }
      return f;
    },
    // Hard: counts what I hold against what is still out there.
    estimateHard: function (hand, cut, n) {
      var w = HARD_COEF[n] && HARD_COEF[n][cut ? 1 : 0];
      if (!w) return this.estimate(hand, cut, n);
      var f = this.features(hand, cut), e = 0;
      for (var i = 0; i < f.length; i++) e += f[i] * w[i];
      return Math.max(0, Math.min(hand.length, e));
    },
    call: function (hand, cut, n, cards, sum, isLast, level, ctx) {
      ctx = ctx || {};
      var est, c;
      if (level === 'hard' || level === 'hc') {
        est = this.estimateHard(hand, cut, n);
        return fixLast(Math.round(est), est, cards, sum, isLast);
      }
      est = this.estimate(hand, cut, n);
      if (level === 'easy') c = Math.round(est + (Math.random() - 0.5) * 3.4);
      else c = Math.round(est + (Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0));
      return fixLast(c, est, cards, sum, isLast);
    },
    play: function (hand, led, trick, cut, need, level, ctx) {
      if (level === 'hard' || level === 'hp') return this.playHard(hand, led, trick, cut, need, ctx || {});
      if (level === 'easy' && Math.random() < 0.5) {
        var lg = legalCards(hand, led);
        return lg[rnd(lg.length)];
      }
      return this.playMedium(hand, led, trick, cut, need);
    },
    playMedium: function (hand, led, trick, cut, need) {
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
    },
    // Hard plays like Medium, except it leads smarter when it does not want another hand:
    // it leads the card least likely to win, counting what has already been played.
    playHard: function (hand, led, trick, cut, need, ctx) {
      var legal = legalCards(hand, led);
      if (legal.length === 1) return legal[0];
      if (led || need > 0) return this.playMedium(hand, led, trick, cut, need);
      var seen = seenSet(hand, ctx.played);
      var val = function (c) { return rankOf(c) + (suitOf(c) === cut ? 20 : 0); };
      var prob = function (c) { return winProb(c, hand, seen, cut); };
      return legal.slice().sort(function (a, b) { return prob(a) - prob(b) || val(a) - val(b); })[0];
    }
  };

  function cleanName(name) {
    return Array.from(String(name || '').replace(/\s+/g, ' ').trim()).slice(0, 16).join('');   // by character, so emoji are not cut in half
  }

  function Game(code, opts) {
    opts = opts || {};
    this.code = code;
    this.fast = !!opts.fast;
    this.lastHoldMs = opts.lastHoldMs || (this.fast ? 1 : 4000);   // the table stays this long after the last hand of a round
    this.lastRoundMs = opts.lastRoundMs || 45000;   // the Last round tab stays open until this long after the next round starts
    this.roundStartAt = 0;
    this.lockTimer = null;
    this.againDelayMs = opts.againDelayMs != null ? opts.againDelayMs : (this.fast ? 0 : 30000);   // final scores stay up this long before the next game
    this.overAt = null;         // when the game ended
    this.roundTricks = [];      // every hand of the round under way: { trick: [{ pid, card }], winner }
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
    this.botLevel = 'medium';   // easy | medium | hard
    this.seq = 0;               // bumps on every change so clients can order updates
    this.played = [];
    this.timerScale = 1;        // tests shrink this
    this.turnEnd = null;
    this.chat = [];
    this.chatSeq = 0;
    this.voyeurs = [];          // people who joined after the start to watch: { id, name, token, connected, dcAt, peek }
    this.awayLimit = 2;         // auto-played turns in a row (while away) before the seat becomes a bot
    this.closed = false;
    this.touched = Date.now();
    this.onChange = function () {};
    this.onKick = function () {};   // (token, kicked): the server closes that person's live stream
  }

  var MAX_VOYEURS = 10;

  Game.prototype.humans = function () { return this.players.filter(function (p) { return !p.bot; }); };
  Game.prototype.byId = function (id) { return this.players.filter(function (p) { return p.id === id; })[0]; };
  Game.prototype.voyeurById = function (id) { return this.voyeurs.filter(function (v) { return v.id === id; })[0]; };
  // a player or a voyeur: both share one id counter, and a token follows its person when a voyeur takes a seat
  Game.prototype.who = function (id) { return this.byId(id) || this.voyeurById(id); };
  Game.prototype.byToken = function (t) {
    if (!t) return undefined;
    return this.players.filter(function (p) { return p.token === t; })[0] ||
      this.voyeurs.filter(function (v) { return v.token === t; })[0];
  };

  Game.prototype.uniqueName = function (name, exceptId) {
    var base = cleanName(name), n = base, k = 2, self = this;
    var taken = function (x) {
      return self.players.concat(self.voyeurs).some(function (p) { return p.id !== exceptId && p.name.toLowerCase() === x.toLowerCase(); });
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

  // What someone who types a code for a game that has already started is offered: watch it, and take a seat back
  // if their name matches a seat that was theirs (dropped off, or left).
  Game.prototype.joinInfo = function (name) {
    return {
      players: this.humans().map(function (p) { return { id: p.id, name: p.name }; }),
      claim: !!this.seatByName(name),
      full: this.voyeurs.length >= MAX_VOYEURS
    };
  };

  Game.prototype.addVoyeur = function (name, token, peekPid) {
    if (this.phase === 'lobby') return { err: 'Join the room as a player' };
    if (!cleanName(name)) return { err: 'Enter your name' };
    if (this.voyeurs.length >= MAX_VOYEURS) return { err: 'Too many voyeurs in this room (' + MAX_VOYEURS + ')' };
    var v = { id: this.nextId++, name: this.uniqueName(name), token: token || null, connected: true, dcAt: 0, peek: null };
    this.voyeurs.push(v);
    var t = peekPid != null ? this.byId(parseInt(peekPid, 10)) : null;
    if (t && !t.bot) v.peek = { pid: t.id, state: 'pending' };   // that player is asked; until they say yes it is the table only
    this.pushChat(null, '', v.name + ' joined as a voyeur', true);
    this.emit();
    return { ok: true, pid: v.id };
  };

  // A voyeur asks to see one player's hand (pid), or goes back to the table only (null)
  Game.prototype.setPeek = function (v, pid) {
    if (pid === null || pid === undefined || pid === '') { v.peek = null; this.emit(); return { ok: true }; }
    var t = this.byId(parseInt(pid, 10));
    if (!t) return { err: 'No such player' };
    if (t.bot) return { err: 'Bots have no one to ask, so they stay on the table view' };
    v.peek = { pid: t.id, state: 'pending' };
    this.emit();
    return { ok: true };
  };

  // Seats that used to be a person's: a bot now, and that person can come back
  Game.prototype.seatByName = function (name) {
    var want = cleanName(name).toLowerCase();
    if (!want || this.phase === 'lobby') return undefined;
    return this.players.filter(function (p) { return p.bot && p.ex && p.ex.name.toLowerCase() === want; })[0];
  };
  Game.prototype.seatByClaim = function (token) {
    if (!token || this.phase === 'lobby') return undefined;
    return this.players.filter(function (p) { return p.bot && p.ex && p.ex.claim === token; })[0];
  };
  Game.prototype.takeBack = function (p, token) {
    p.bot = false; p.token = token; p.connected = true; p.ex = null; p.awayAuto = 0; delete p.level;
    if (!this.hostId) this.hostId = p.id;
    this.pushChat(null, '', p.name + ' is back at the table', true);
    this.emit();
    return p;
  };
  // same browser: the saved token is enough
  Game.prototype.reclaim = function (token) {
    var p = this.seatByClaim(token);
    return p ? this.takeBack(p, token) : null;
  };
  // another device: the same name, offered when joining
  Game.prototype.claimByName = function (name, token) {
    var p = this.seatByName(name);
    return p ? this.takeBack(p, token) : null;
  };

  // a seat stops being played by a person: a bot takes over, keeping hand, call and score
  Game.prototype.becomeBot = function (p, mode) {
    // mode: 'away' (can return with the same browser or by name), 'left' (by name), 'kicked' (cannot return)
    p.ex = mode === 'kicked' ? null : { name: p.name, claim: mode === 'away' ? p.token : null };
    p.bot = true; p.token = null; p.connected = true; p.awayAuto = 0;
    this.voyeurs.forEach(function (v) { if (v.peek && v.peek.pid === p.id) v.peek = null; });
  };
  // a voyeur sits down in a seat (hand, call and score stay as they were)
  Game.prototype.giveSeat = function (t, v) {
    this.voyeurs = this.voyeurs.filter(function (x) { return x.id !== v.id; });
    this.voyeurs.forEach(function (x) { if (x.peek && x.peek.pid === t.id) x.peek = null; });
    t.bot = false; t.ex = null; t.awayAuto = 0; delete t.level;
    t.name = this.uniqueName(v.name, t.id);
    t.token = v.token; t.connected = v.connected;
  };
  // an away player's turn is auto-played; after awayLimit in a row the seat becomes a bot
  Game.prototype.noteAway = function (p) {
    p.awayAuto = (p.awayAuto || 0) + 1;
    if (p.awayAuto < this.awayLimit) return;
    var name = p.name;
    this.becomeBot(p, 'away');
    if (this.hostId === p.id) this.reassignHost();
    this.pushChat(null, '', name + ' was away for ' + this.awayLimit + ' turns, so a bot plays the seat. They can take it back', true);
    this.emit();
  };
  // voyeurs who closed the page and never came back are dropped
  Game.prototype.pruneVoyeurs = function (now) {
    var gone = this.voyeurs.filter(function (v) { return !v.connected && v.dcAt && now - v.dcAt > 120000; });
    if (!gone.length) return;
    var self = this;
    gone.forEach(function (v) { self.onKick(v.token, false); });
    this.voyeurs = this.voyeurs.filter(function (v) { return gone.indexOf(v) < 0; });
    this.emit();
  };

  Game.prototype.setConnected = function (pid, v) {
    var p = this.who(pid);
    if (!p || p.bot || p.connected === v) return;
    p.connected = v;
    if (v) p.awayAuto = 0; else p.dcAt = Date.now();
    this.emit();
  };

  Game.prototype.emit = function () {
    this.touched = Date.now();
    this.seq++;
    this.schedule();
    this.onChange();
  };

  Game.prototype.reassignHost = function (exceptId) {
    var hs = this.humans().filter(function (p) { return p.id !== exceptId; });
    var h = hs.filter(function (p) { return p.connected; })[0] || hs[0] || this.humans()[0];
    this.hostId = h ? h.id : null;
  };

  // What a voyeur may do: watch, chat, rename, choose whose hand to ask for, and stop watching.
  Game.prototype.voyeurAct = function (v, a) {
    switch (a.type) {
      case 'rename': {
        if (!cleanName(a.name)) return { err: 'Enter a name' };
        v.name = this.uniqueName(a.name, v.id);
        this.emit();
        return { ok: true };
      }
      case 'chat': {
        var text = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!text) return { err: 'Type a message first' };
        var now = Date.now();
        if (v.lastChat && now - v.lastChat < 350) return { err: 'Slow down' };
        v.lastChat = now;
        this.pushChat(v.id, v.name, text, false, true);
        this.emit();
        return { ok: true };
      }
      case 'peek': return this.setPeek(v, a.pid);
      case 'leave': {
        this.voyeurs = this.voyeurs.filter(function (x) { return x.id !== v.id; });
        this.onKick(v.token, false);
        if (!this.humans().length && !this.voyeurs.length) this.closed = true;
        this.emit();
        return { ok: true };
      }
    }
    return { err: 'Voyeurs can watch and chat' };
  };

  Game.prototype.act = function (pid, a) {
    var p = this.byId(pid);
    if (!a) return { err: 'Not in this room' };
    if (!p) {
      var vy = this.voyeurById(pid);
      return vy ? this.voyeurAct(vy, a) : { err: 'Not in this room' };
    }
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
      case 'level': {
        if (!isHost) return { err: 'Only the host can do that' };
        if (['easy', 'medium', 'hard'].indexOf(a.level) < 0) return { err: 'Bad level' };
        this.botLevel = a.level;
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
        this.removeHuman(t, true, a.to);
        return { ok: true };
      }
      case 'leave': {
        this.removeHuman(p, false, a.to);
        return { ok: true };
      }
      case 'peekreply': {   // the player a voyeur asked about says yes or no (a yes can be taken back with another no)
        var vy2 = this.voyeurById(parseInt(a.vid, 10));
        if (!vy2 || !vy2.peek || vy2.peek.pid !== pid) return { err: 'Not now' };
        vy2.peek.state = a.ok ? 'ok' : 'denied';
        this.emit();
        return { ok: true };
      }
      case 'seat': {   // the host gives a bot's seat to a voyeur, between rounds
        if (!isHost) return { err: 'Only the host can do that' };
        if (this.phase !== 'roundover') return { err: 'Seats change hands between rounds' };
        var sv = this.voyeurById(parseInt(a.vid, 10)), st = this.byId(parseInt(a.pid, 10));
        if (!sv || !st || !st.bot) return { err: 'Pick a bot seat' };
        var was = st.name;
        this.giveSeat(st, sv);
        this.pushChat(null, '', st.name + ' takes ' + was + '’s seat', true);
        this.emit();
        return { ok: true };
      }
      case 'start': {
        if (!isHost || this.phase !== 'lobby') return { err: 'Only the host can start' };
        var n = Math.max(this.size, this.humans().length);
        if (n < 3) return { err: 'Need at least 3 players. Add a bot.' };
        this.begin();
        return { ok: true };
      }
      case 'call': p.awayAuto = 0; return this.doCall(p, a.n);
      case 'play': p.awayAuto = 0; return this.doPlay(p, a.card);
      case 'next': {
        if (this.phase !== 'roundover') return { ok: true };   // someone else already dealt: nothing to do
        this.startRound(this.round.i + 1);
        return { ok: true };
      }
      case 'again':    // deal a new game now, same players and bots
      case 'setup': {  // back to the lobby to add or remove players first
        if (!isHost || this.phase !== 'gameover') return { err: 'Only the host can do that' };
        // the final scores stay up for a while first (a little slack for clock drift)
        var wait = this.overAt + this.againDelayMs - Date.now();
        if (wait > 400) return { err: 'The next game can start in ' + Math.ceil(wait / 1000) + 's' };
        return a.type === 'again' ? this.newGame() : this.toLobby();
      }
    }
    return { err: 'Unknown action' };
  };

  // voyeurs sit down for the next game while there is room at the table
  Game.prototype.seatVoyeurs = function () {
    var self = this, stay = [];
    this.voyeurs.forEach(function (v) {
      if (self.humans().length < 8) self.players.push({ id: v.id, name: v.name, bot: false, token: v.token, connected: v.connected, score: 0, call: null, made: 0, hand: [] });
      else { v.peek = null; stay.push(v); }
    });
    this.voyeurs = stay;
    if (this.humans().length > this.size) this.size = this.humans().length;
  };
  Game.prototype.resetGame = function () {
    this.players.forEach(function (x) { x.score = 0; x.call = null; x.made = 0; x.hand = []; x.awayAuto = 0; });
    this.history = []; this.round = null; this.winners = []; this.trick = []; this.led = null; this.trickWinner = null;
    this.schedKey = null; this.turnEnd = null; this.played = []; this.roundTricks = []; this.overAt = null;
  };
  // The lobby again: bots go (the lobby shows their seats), the people stay, voyeurs sit down.
  Game.prototype.toLobby = function () {
    this.players = this.humans();
    this.resetGame();
    this.seatVoyeurs();
    this.phase = 'lobby';
    this.emit();
    return { ok: true };
  };
  // A new game at once with the same people and the same bots (voyeurs sit down; spare bots make room for them).
  Game.prototype.newGame = function () {
    var bots = this.players.filter(function (p) { return p.bot; });
    this.players = this.humans();
    this.resetGame();
    this.seatVoyeurs();
    this.begin(bots);
    return { ok: true };
  };

  Game.prototype.pushChat = function (pid, name, text, sys, voy) {
    this.chat.push({ id: ++this.chatSeq, pid: pid, name: name, text: text, sys: !!sys, voy: !!voy });
    if (this.chat.length > 80) this.chat.splice(0, this.chat.length - 80);
  };

  // Someone leaves, or the host removes them. In the lobby the seat just goes. In a game a connected voyeur can
  // take it over (toVid), otherwise a bot plays it on. Hand, call and score stay with the seat.
  Game.prototype.removeHuman = function (t, kicked, toVid) {
    var token = t.token, name = t.name, took = false;
    if (this.phase === 'lobby') {
      this.players = this.players.filter(function (x) { return x.id !== t.id; });
    } else {
      var v = toVid != null ? this.voyeurById(parseInt(toVid, 10)) : null;
      var what = name + (kicked ? ' was removed' : ' left');
      if (v && v.connected) {
        this.giveSeat(t, v); took = true;
        this.pushChat(null, '', what + '. ' + t.name + ' takes the seat', true);
      } else {
        this.becomeBot(t, kicked ? 'kicked' : 'left');
        this.pushChat(null, '', what + '. A bot plays the seat', true);
      }
    }
    if (this.hostId === t.id) this.reassignHost(took ? t.id : undefined);
    this.onKick(token, kicked);
    if (!this.humans().length && !this.voyeurs.length) this.closed = true;
    this.emit();
  };

  // keepBots: bots from the game before, reused (so "Play again" keeps the same table)
  Game.prototype.begin = function (keepBots) {
    var humans = this.humans();
    var n = Math.max(this.size, humans.length);
    var want = n - humans.length;
    var bots = (keepBots || []).slice(0, want);
    var used = {};
    humans.concat(bots).forEach(function (p) { used[p.name.toLowerCase()] = 1; });
    var pool = shuffle(BOT_NAMES.slice()).filter(function (x) { return !used[x.toLowerCase()]; });
    var kept = bots.length;
    for (var i = kept; i < want; i++) {
      bots.push({ id: this.nextId++, name: pool[i - kept] || ('Bot ' + (i + 1)), bot: true, token: null, connected: true, score: 0, call: null, made: 0, hand: [] });
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
    this.played = [];
    this.roundTricks = [];
    // the previous round's last hand can be looked at until lastRoundMs into this round; an update goes out when it locks
    this.roundStartAt = Date.now();
    clearTimeout(this.lockTimer);
    if (this.history.length) {
      var self = this;
      this.lockTimer = setTimeout(function () { self.emit(); }, this.lastRoundMs + 60);
      if (this.lockTimer && this.lockTimer.unref) this.lockTimer.unref();
    }
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
    this.played.push(card);
    if (this.trick.length < this.n) {
      this.turnIdx = (this.turnIdx + 1) % this.n;
      this.emit();
      return { ok: true };
    }
    var wid = trickWinner(this.trick, this.round.cut);
    var w = this.byId(wid);
    w.made++;
    this.trickWinner = wid;
    this.roundTricks.push({ trick: this.trick.map(function (t) { return { pid: t.pid, card: t.card }; }), winner: wid });
    this.phase = 'trickdone';
    this.turnIdx = this.players.indexOf(w);
    this.emit();
    var self = this;
    // After the last hand of a round the table is held longer (it shows every hand of the round) before the Screen opens.
    var lastHand = p.hand.length === 0;
    clearTimeout(this.ttimer);
    this.ttimer = setTimeout(function () { self.afterTrick(); }, lastHand ? this.lastHoldMs : (this.fast ? 1 : 1600));
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
    // every hand of the round is kept with it, for the Hands won tab on the Screen
    this.history.push({ i: this.round.i, cards: this.round.cards, cut: this.round.cut, res: res, tricks: this.roundTricks });
    this.trick = []; this.led = null; this.trickWinner = null;
    if (this.round.i >= this.per - 1) {
      var max = Math.max.apply(null, this.players.map(function (p) { return p.score; }));
      this.winners = this.players.filter(function (p) { return p.score === max; }).map(function (p) { return p.id; });
      this.phase = 'gameover';
      this.overAt = Date.now();
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
    var delay, timed = false, away = false;
    if (cur.bot) delay = this.fast ? 1 : 600 + rnd(500);
    else if (!cur.connected) { delay = this.fast ? 1 : (this.autoMs || 90000); away = true; }
    else if (this.timerSec) { delay = this.timerSec * 1000 * this.timerScale; timed = true; }
    else return;
    if (timed) this.turnEnd = Date.now() + delay;
    var self = this;
    this.timer = setTimeout(function () {
      self.timer = null; self.schedKey = null;
      if (timed && self.players[self.turnIdx] === cur && !cur.bot) {
        self.pushChat(null, '', 'Time’s up for ' + cur.name + ' — played automatically', true);
      }
      var played = self.botAct(cur.id);
      // an absent player's auto-played turns are counted: awayLimit in a row hands the seat to a bot
      if (played && away && !cur.bot && !cur.connected) self.noteAway(cur);
    }, delay);
  };

  Game.prototype.botAct = function (pid) {
    var cur = this.players[this.turnIdx];
    if (!cur || cur.id !== pid) return false;
    var r = null;
    // a human whose time ran out (or who is away) is played for at Medium, whatever the bot level is
    var level = cur.bot ? (cur.level || this.botLevel) : 'medium';
    if (this.phase === 'calling') {
      var cs = this.callState();
      var k = this.players.filter(function (p) { return p.call !== null; }).length;
      var n = Bot.call(cur.hand, this.round.cut, this.n, this.round.cards, cs.sum, cs.isLast, level, { k: k });
      r = this.doCall(cur, n);
    } else if (this.phase === 'playing') {
      var c = Bot.play(cur.hand, this.led, this.trick, this.round.cut, cur.call - cur.made, level, { n: this.n, played: this.played });
      r = this.doPlay(cur, c);
    }
    return !!(r && r.ok);
  };

  Game.prototype.destroy = function () {
    clearTimeout(this.timer); clearTimeout(this.ttimer); clearTimeout(this.lockTimer);
  };

  // The final hand of the last finished round, for the Last round tab (in case a card was missed to lag). It is
  // open from the end of the round until lastRoundMs into the next one; after that it is not sent at all.
  Game.prototype.lastRoundOpen = function () {
    if (this.phase === 'lobby' || !this.history.length) return null;
    var h = this.history[this.history.length - 1];
    if (!h.tricks || !h.tricks.length) return null;
    var ended = this.phase === 'roundover' || this.phase === 'gameover';
    if (!ended && Date.now() - this.roundStartAt >= this.lastRoundMs) return null;
    var hand = h.tricks[h.tricks.length - 1];
    return { i: h.i, cards: h.cards, cut: h.cut, res: h.res, trick: hand.trick, winner: hand.winner, led: hand.trick[0].card[0] };
  };

  // The hands this player has won, round by round (the round under way last, with hands so far)
  Game.prototype.winsFor = function (pid) {
    var out = [], p = this.byId(pid);
    this.history.forEach(function (h) {
      var r = h.res[pid] || { call: 0, made: 0, pts: 0 };
      out.push({ i: h.i, cards: h.cards, cut: h.cut, done: true, call: r.call, made: r.made, pts: r.pts,
        hands: (h.tricks || []).filter(function (t) { return t.winner === pid; }) });
    });
    if (this.round && this.round.i >= this.history.length && this.phase !== 'lobby' && this.phase !== 'gameover') {
      out.push({ i: this.round.i, cards: this.round.cards, cut: this.round.cut, done: false, call: p ? p.call : null, made: p ? p.made : 0, pts: 0,
        hands: this.roundTricks.filter(function (t) { return t.winner === pid; }) });
    }
    return out;
  };

  Game.prototype.snapshot = function (pid) {
    var me = this.byId(pid), vy = me ? null : this.voyeurById(pid);
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
        return { id: p.id, name: p.name, bot: p.bot, connected: p.connected, call: p.call, made: p.made, score: p.score, ex: !!p.ex };
      }),
      voyeur: !!vy, meName: me ? me.name : (vy ? vy.name : ''),
      voyeurs: this.voyeurs.map(function (v) {
        return { id: v.id, name: v.name, connected: v.connected, peek: v.peek ? { pid: v.peek.pid, state: v.peek.state } : null };
      }),
      // the score lines only; every hand of every round stays on the server and is sent as `wins` (the player's own)
      history: this.history.map(function (h) { return { i: h.i, cards: h.cards, cut: h.cut, res: h.res }; }),
      lastRound: this.lastRoundOpen(),
      againIn: this.phase === 'gameover' ? Math.max(0, this.overAt + this.againDelayMs - Date.now()) : null,
      wins: null,
      round: this.round, turn: turn, led: this.led,
      trick: this.trick, trickWinner: this.trickWinner, winners: this.winners,
      hand: me && inGame ? me.hand : [], legal: [], callInfo: null,
      timerSec: this.timerSec, botLevel: this.botLevel, seq: this.seq,
      turnLeft: this.turnEnd && (this.phase === 'calling' || this.phase === 'playing') ? Math.max(0, this.turnEnd - Date.now()) : null,
      chat: this.chat.slice(-50)
    };
    if (me && this.phase === 'playing' && turn === pid) s.legal = legalCards(me.hand, this.led);
    if (me && this.phase === 'calling' && turn === pid) s.callInfo = this.callState();
    // Hands won: the player's own, every round. A voyeur gets them for the player whose hand they may see.
    var wt = me || (vy && vy.peek && vy.peek.state === 'ok' ? this.byId(vy.peek.pid) : null);
    if (wt && inGame) s.wins = this.winsFor(wt.id);
    if (vy) {
      // A voyeur sees the table. A hand only comes with it once that player has said yes.
      s.peek = null;
      if (vy.peek) {
        var tp = this.byId(vy.peek.pid);
        if (tp) {
          s.peek = { pid: tp.id, name: tp.name, state: vy.peek.state };
          if (vy.peek.state === 'ok' && inGame) s.hand = tp.hand;
        }
      }
    }
    return s;
  };

  return {
    Game: Game, Bot: Bot, SUITS: SUITS, SUIT_NAME: SUIT_NAME, CUT_ORDER: CUT_ORDER,
    suitOf: suitOf, rankOf: rankOf, legalCards: legalCards, trickWinner: trickWinner,
    newDeck: newDeck, shuffle: shuffle, cleanName: cleanName
  };
});

