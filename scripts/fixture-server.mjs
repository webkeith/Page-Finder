// Tiny static server for the sample site in fixtures/site. Used by tests and the manual check.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'site');

export function createFixtureServer() {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const origin = `http://${req.headers.host}`;
    const url = new URL(req.url, origin);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (p === '/old-refunds') return res.writeHead(301, { location: '/refunds' }).end();
    if (p === '/account') return res.writeHead(302, { location: '/login?next=/account' }).end();
    if (p === '/members') return res.writeHead(403, { 'content-type': 'text/html' }).end('<h1>Forbidden</h1>');
    if (p === '/slow') return; // never responds -> timeout
    if (p === '/guide.pdf') return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4');
    const file = p === '/' ? 'index.html' : /\.(txt|xml)$/.test(p) ? p.slice(1) : `${p.slice(1)}.html`;
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full)) return res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
    const type = file.endsWith('.xml') ? 'application/xml' : file.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type }).end(fs.readFileSync(full, 'utf8').replaceAll('{{origin}}', origin));
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  const close = () => new Promise((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); });
  return { server, close };
}
