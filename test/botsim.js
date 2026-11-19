'use strict';
// Bot-vs-bot tournament. node test/botsim.js [games] [seats e.g. easy,medium,hard,medium]
const { Game } = require('../public/engine.js');

function playGame(levels) {
  const g = new Game('SIM', { fast: true });
  g.schedule = function () {};
  g.onChange = function () {};
  const n = levels.length;
  g.players = levels.map((lv, i) => ({ id: i + 1, name: 'B' + (i + 1), bot: true, level: lv, token: null, connected: true, score: 0, call: null, made: 0, hand: [] }));
  g.nextId = n + 1; g.n = n; g.per = Math.floor(52 / n); g.first0 = Math.floor(Math.random() * n);
  g.history = []; g.winners = [];
  g.startRound(0);
  let guard = 0;
  while (g.phase !== 'gameover' && guard++ < 100000) {
    if (g.phase === 'calling' || g.phase === 'playing') g.botAct(g.players[g.turnIdx].id);
    else if (g.phase === 'trickdone') { clearTimeout(g.ttimer); g.afterTrick(); }
    else if (g.phase === 'roundover') g.startRound(g.round.i + 1);
  }
  clearTimeout(g.ttimer);
  const hit = {}, tot = {};
  g.history.forEach(h => g.players.forEach(p => { const r = h.res[p.id]; hit[p.level] = (hit[p.level] || 0) + (r.call === r.made ? 1 : 0); tot[p.level] = (tot[p.level] || 0) + 1; }));
  return { scores: g.players.map(p => ({ level: p.level, score: p.score })), hit, tot };
}

function tournament(levels, games) {
  const sum = {}, cnt = {}, hit = {}, tot = {};
  for (let k = 0; k < games; k++) {
    const seats = levels.slice().sort(() => Math.random() - 0.5);   // shuffle seats
    const r = playGame(seats);
    r.scores.forEach(x => { sum[x.level] = (sum[x.level] || 0) + x.score; cnt[x.level] = (cnt[x.level] || 0) + 1; });
    Object.keys(r.hit).forEach(l => { hit[l] = (hit[l] || 0) + r.hit[l]; tot[l] = (tot[l] || 0) + r.tot[l]; });
  }
  const out = {};
  Object.keys(sum).forEach(l => { out[l] = { avg: sum[l] / cnt[l], hitRate: hit[l] / tot[l] }; });
  return out;
}

module.exports = { playGame, tournament };

if (require.main === module) {
  const games = parseInt(process.argv[2] || '200', 10);
  const seats = (process.argv[3] || 'easy,medium,hard,medium').split(',');
  const t0 = Date.now();
  const r = tournament(seats, games);
  Object.keys(r).forEach(l => console.log(l.padEnd(7), 'avg score', r[l].avg.toFixed(1), ' calls hit', (100 * r[l].hitRate).toFixed(1) + '%'));
  console.log((Date.now() - t0) + ' ms for', games, 'games,', seats.join('/'));
}
