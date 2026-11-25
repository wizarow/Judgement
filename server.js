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
const streams = new Map();  // code -> Map(pid -> Set(res))
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
  m.forEach((set, pid) => {
    const data = 'data: ' + JSON.stringify(g.snapshot(pid)) + '\n\n';
    set.forEach(res => { try { res.write(data); } catch (e) {} });
  });
}

function makeRoom() {
  const code = newCode();
  if (!code) return null;
  const g = new Game(code, { fast: process.env.JD_FAST === '1' });
  g.onChange = () => broadcast(code);
  g.onKick = (pid, token, kicked) => {
    const set = streams.get(code) && streams.get(code).get(pid);
    if (set) {
      set.forEach(res => {
        try { res.write('event: removed\ndata: ' + JSON.stringify({ kicked: !!kicked }) + '\n\n'); res.end(); } catch (e) {}
      });
      streams.get(code).delete(pid);
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
      const p = g && g.byToken(url.searchParams.get('token'));
      if (!g || !p) return send(res, 404, { err: 'Room not found' });
      return send(res, 200, { s: g.snapshot(p.id) });
    }

    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const g = rooms.get(code);
      const p = g && g.byToken(url.searchParams.get('token'));
      if (!g || !p) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
      });
      if (req.socket) { req.socket.setNoDelay(true); req.socket.setKeepAlive(true, 15000); }
      res.write('retry: 2000\n\n');
      const m = streams.get(code);
      if (!m.has(p.id)) m.set(p.id, new Set());
      m.get(p.id).add(res);
      g.setConnected(p.id, true);
      res.write('data: ' + JSON.stringify(g.snapshot(p.id)) + '\n\n');
      req.on('close', () => {
        const set = m.get(p.id);
        if (set) { set.delete(res); if (!set.size) { m.delete(p.id); g.setConnected(p.id, false); } }
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
        const token = crypto.randomBytes(12).toString('hex');
        const r = g.addHuman(b.name, token);
        if (r.err) return send(res, 400, r);
        return send(res, 200, { code, token, pid: r.pid });
      }
      if (url.pathname === '/api/rejoin') {
        const g = rooms.get(code);
        const p = g && g.byToken(b.token);
        if (!p) return send(res, 404, { err: 'Room not found' });
        return send(res, 200, { code, token: b.token, pid: p.id });
      }
      if (url.pathname === '/api/act') {
        const g = rooms.get(code);
        const p = g && g.byToken(b.token);
        if (!p) return send(res, 404, { err: 'Room not found' });
        const r = g.act(p.id, b.a);
        // the reply carries the sender's fresh state so their screen updates without waiting for the stream
        if (r && r.ok && g.byId(p.id) && !(b.a && b.a.type === 'leave')) r.s = g.snapshot(p.id);
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
