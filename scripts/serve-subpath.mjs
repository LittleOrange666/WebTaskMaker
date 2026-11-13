// 在子路徑下提供 dist/，用來測試部署在非根目錄時是否正常（spec §13）
// 用法：node scripts/serve-subpath.mjs [port] [subpath]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] ?? 4173);
const base = (process.argv[3] ?? '/some/path/').replace(/\/?$/, '/');
const root = path.resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith(base)) { res.writeHead(404); res.end('not under ' + base); return; }
  let file = path.join(root, url.slice(base.length));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving dist at http://localhost:${port}${base}`));
