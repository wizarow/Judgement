'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
function serveStatic(req, res, url) {
  let f = url.pathname === '/' ? '/index.html' : url.pathname;
  if (f !== '/index.html' && f !== '/engine.js') { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(PUB, f), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)], 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, rooms: rooms.size });

    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const g = rooms.get(code);
      const p = g && g.byToken(url.searchParams.get('token'));
      if (!g || !p) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
      });
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
        return send(res, 200, g.act(p.id, b.a));
      }
    }
    if (req.method === 'GET') return serveStatic(req, res, url);
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    try { send(res, 500, { err: 'Server error' }); } catch (x) {}
  }
});

setInterval(() => {
  streams.forEach(m => m.forEach(set => set.forEach(res => { try { res.write(': ping\n\n'); } catch (e) {} })));
}, 20000);

setInterval(() => {
  const now = Date.now();
  rooms.forEach((g, code) => {
    const idle = now - g.touched > 3 * 3600 * 1000;
    const live = streams.get(code) && streams.get(code).size > 0;
    if (g.closed || (idle && !live)) { g.destroy(); rooms.delete(code); streams.delete(code); }
  });
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log('Judgement listening on ' + PORT));
