import './prepare-site.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../site/dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.zip': 'application/zip' };
const listeners = new Set();
let refresh;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__reload') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      response.write(': local preview connected\n\n');
      listeners.add(response);
      request.on('close', () => listeners.delete(response));
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let info = await stat(file);
    if (info.isDirectory()) { file = resolve(file, 'index.html'); info = await stat(file); }
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      ...(extname(file) === '.zip' ? { 'content-disposition': `attachment; filename="${file.split(sep).pop()}"` } : {}),
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado.'); }
});
const watcher = watch(root, { recursive: true }, (event, filename) => {
  if (!filename || filename.includes('.DS_Store')) return;
  clearTimeout(refresh);
  refresh = setTimeout(() => { for (const client of listeners) client.write('event: refresh\ndata: updated\n\n'); }, 120);
});
let port = Number(process.env.ALWAYS_DARK_SITE_PORT || 4173);
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 4185) { port++; server.listen(port, '127.0.0.1'); }
  else { console.error(error.message); process.exitCode = 1; }
});
server.listen(port, '127.0.0.1', () => console.log(`Always Dark · Local: http://127.0.0.1:${port}/`));
function close() {
  clearTimeout(refresh); watcher.close();
  for (const client of listeners) client.end();
  server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
