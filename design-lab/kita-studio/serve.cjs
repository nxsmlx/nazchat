// Local preview only. Serve the prototype folder, never the repository or secrets.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.PORT || 5174);
const root = __dirname;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const files = {'/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8']};
  const asset = files[pathname];
  if (!asset) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, {'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  fs.createReadStream(path.join(root, asset[0])).pipe(res);
});
server.listen(port, '0.0.0.0', () => console.log(`Kita Studio preview: http://localhost:${port}`));
