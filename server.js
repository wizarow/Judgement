'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Game } = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const rooms = new Map();    // code -> Game
const streams = new Map();  // code -> Map(token -> Set(res)); keyed by token because a voyeur's seat (id) can change under it
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (let k = 0; k < 200; k++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[crypto.randomInt(LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function broadcast(code) {
  const g = rooms.get(code), m = streams.get(code);
  if (!g || !m) return;
  m.forEach((set, token) => {
    const who = g.byToken(token);
    if (!who) return;
    const data = 'data: ' + JSON.stringify(g.snapshot(who.id)) + '\n\n';
    set.forEach(res => { try { res.write(data); } catch (e) {} });
  });
}

// A person by their token. A seat that went to a bot (they were away, or left) is handed back to its saved token here,
// so reopening the same browser puts them straight back at the table.
function resolve(g, token) {
  return g && (g.byToken(token) || g.reclaim(token));
}

function makeRoom() {
  const code = newCode();
  if (!code) return null;
  // JD_FAST / JD_LAST_ROUND_MS / JD_AGAIN_MS (ms) only exist so tests can run quickly; live rooms use the real timings
  const g = new Game(code, {
    fast: process.env.JD_FAST === '1',
    lastRoundMs: +process.env.JD_LAST_ROUND_MS || 0,
    againDelayMs: process.env.JD_AGAIN_MS != null && process.env.JD_AGAIN_MS !== '' ? +process.env.JD_AGAIN_MS : undefined
  });
  g.onChange = () => broadcast(code);
  g.onKick = (token, kicked) => {
    const set = token && streams.get(code) && streams.get(code).get(token);
    if (set) {
      set.forEach(res => {
        try { res.write('event: removed\ndata: ' + JSON.stringify({ kicked: !!kicked }) + '\n\n'); res.end(); } catch (e) {}
      });
      streams.get(code).delete(token);
    }
  };
  rooms.set(code, g);
  streams.set(code, new Map());
  return g;
}

function send(res, status, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(b);
}

function readBody(req) {
  return new Promise(resolve => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 20000) { req.destroy(); resolve({}); } });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };

// The two page files are compressed once (Brotli and gzip) and kept in memory, and sent with an ETag so a phone that
// already has the current version gets a tiny 304 instead of the whole file. Only these static files are touched:
// the live stream (/api/stream) and the JSON API are never compressed or cached.
const staticCache = new Map();   // file -> { mtimeMs, raw, gz, br, etag, type }
function loadStatic(f, cb) {
  const p = path.join(PUB, f);
  fs.stat(p, (err, st) => {
    if (err) return cb(err);
    const hit = staticCache.get(f);
    if (hit && hit.mtimeMs === st.mtimeMs) return cb(null, hit);
    fs.readFile(p, (err2, buf) => {
      if (err2) return cb(err2);
      const e = {
        mtimeMs: st.mtimeMs, raw: buf, type: MIME[path.extname(f)],
        etag: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16),
        gz: zlib.gzipSync(buf, { level: 9 }),
        br: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
      };
      staticCache.set(f, e);
      cb(null, e);
    });
  });
}
function serveStatic(req, res, url) {
  let f = url.pathname === '/' ? '/index.html' : url.pathname;
  if (f !== '/index.html' && f !== '/engine.js') { res.writeHead(404); return res.end('Not found'); }
  loadStatic(f, (err, e) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : '';
    const body = enc === 'br' ? e.br : enc === 'gzip' ? e.gz : e.raw;
    const etag = '"' + e.etag + (enc ? '-' + enc : '') + '"';
    const headers = { 'Content-Type': e.type, 'Cache-Control': 'no-cache', 'ETag': etag, 'Vary': 'Accept-Encoding' };
    const inm = String(req.headers['if-none-match'] || '');
    if (inm && inm.split(',').some(t => t.trim().replace(/^W\//, '') === etag)) { res.writeHead(304, headers); return res.end(); }
    if (enc) headers['Content-Encoding'] = enc;
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
  });
}

// A stray error in a timer must not take every room down with it.
process.on('uncaughtException', e => console.error('uncaught', e));
process.on('unhandledRejection', e => console.error('unhandled', e));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, rooms: rooms.size });

    if (req.method === 'GET' && url.pathname === '/api/ping') return send(res, 200, { t: Date.now() });

    // Current state on demand: used to resync after a stalled stream, and as the polling fallback.
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const g = rooms.get(code);
      const p = resolve(g, url.searchParams.get('token'));
      if (!g || !p) return send(res, 404, { err: 'Room not found' });
      return send(res, 200, { s: g.snapshot(p.id) });
    }

    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const g = rooms.get(code);
      const token = url.searchParams.get('token') || '';
      const p = resolve(g, token);
      if (!g || !p) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
      });
      if (req.socket) { req.socket.setNoDelay(true); req.socket.setKeepAlive(true, 15000); }
      res.write('retry: 2000\n\n');
      const m = streams.get(code);
      if (!m.has(token)) m.set(token, new Set());
      m.get(token).add(res);
      g.setConnected(p.id, true);
      res.write('data: ' + JSON.stringify(g.snapshot(p.id)) + '\n\n');
      req.on('close', () => {
        const set = m.get(token);
        if (set) {
          set.delete(res);
          if (!set.size) {
            m.delete(token);
            const who = g.byToken(token);   // looked up now: a voyeur may have sat down since this stream opened
            if (who) g.setConnected(who.id, false);
          }
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const b = await readBody(req);
      const code = String(b.code || '').toUpperCase();

      if (url.pathname === '/api/create') {
        const g = makeRoom();
        if (!g) return send(res, 503, { err: 'Server is busy. Try again.' });
        const token = crypto.randomBytes(12).toString('hex');
        const r = g.addHuman(b.name, token);
        if (r.err) { rooms.delete(g.code); streams.delete(g.code); return send(res, 400, r); }
        return send(res, 200, { code: g.code, token, pid: r.pid });
      }
      if (url.pathname === '/api/join') {
        const g = rooms.get(code);
        if (!g) return send(res, 404, { err: 'Room not found' });
        // A game already under way: the answer carries what the person can do instead (watch, or take a seat back).
        if (g.phase !== 'lobby') return send(res, 400, Object.assign({ err: 'That game has already started', started: true }, g.joinInfo(b.name)));
        const token = crypto.randomBytes(12).toString('hex');
        const r = g.addHuman(b.name, token);
        if (r.err) return send(res, 400, r);
        return send(res, 200, { code, token, pid: r.pid });
      }
      if (url.pathname === '/api/watch') {
        const g = rooms.get(code);
        if (!g) return send(res, 404, { err: 'Room not found' });
        const token = crypto.randomBytes(12).toString('hex');
        const r = g.addVoyeur(b.name, token, b.peek);
        if (r.err) return send(res, 400, r);
        return send(res, 200, { code, token, pid: r.pid, voyeur: true });
      }
      if (url.pathname === '/api/claim') {
        const g = rooms.get(code);
        if (!g) return send(res, 404, { err: 'Room not found' });
        const token = crypto.randomBytes(12).toString('hex');
        const p = g.claimByName(b.name, token);
        if (!p) return send(res, 400, { err: 'There is no seat to take back under that name' });
        return send(res, 200, { code, token, pid: p.id });
      }
      if (url.pathname === '/api/rejoin') {
        const g = rooms.get(code);
        const p = resolve(g, b.token);
        if (!p) return send(res, 404, { err: 'Room not found' });
        return send(res, 200, { code, token: b.token, pid: p.id, voyeur: !g.byId(p.id) });
      }
      if (url.pathname === '/api/act') {
        const g = rooms.get(code);
        const p = resolve(g, b.token);
        if (!p) return send(res, 404, { err: 'Room not found' });
        const r = g.act(p.id, b.a);
        // the reply carries the sender's fresh state so their screen updates without waiting for the stream
        const again = g.byToken(b.token);   // the person's seat may have changed (a voyeur sat down); a leaver is gone
        if (r && r.ok && again && !(b.a && b.a.type === 'leave')) r.s = g.snapshot(again.id);
        return send(res, 200, r);
      }
    }
    if (req.method === 'GET') return serveStatic(req, res, url);
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    try { send(res, 500, { err: 'Server error' }); } catch (x) {}
  }
});

// Heartbeat every 10 s: keeps proxies from closing idle streams, and carries the room's change counter
// so a client that missed an update notices and resyncs.
setInterval(() => {
  streams.forEach((m, code) => {
    const g = rooms.get(code);
    if (!g) return;
    g.pruneVoyeurs(Date.now());
    const data = 'event: hb\ndata: {"seq":' + g.seq + '}\n\n';
    m.forEach(set => set.forEach(res => { try { res.write(data); } catch (e) {} }));
  });
}, 10000);

setInterval(() => {
  const now = Date.now();
  rooms.forEach((g, code) => {
    const idle = now - g.touched > 3 * 3600 * 1000;
    const live = streams.get(code) && streams.get(code).size > 0;
    if (g.closed || (idle && !live)) { g.destroy(); rooms.delete(code); streams.delete(code); }
  });
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log('Judgement listening on ' + PORT);
  ['/index.html', '/engine.js'].forEach(f => loadStatic(f, () => {}));   // compress ahead of the first visitor
});
