const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 5182);
const layoutFile = path.join(root, 'assets', 'atlas_v2', 'group_layout.json');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const method = req.method || 'GET';
  const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);

  if (method === 'POST' && cleanUrl === '/api/atlas-layout') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (!data || !data.cards || !data.side) throw new Error('Invalid atlas layout');
        fs.writeFileSync(layoutFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
        send(res, 200, JSON.stringify({ ok: true, file: layoutFile }));
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: err.message || String(err) }));
      }
    });
    return;
  }

  let urlPath = cleanUrl;
  if (urlPath === '/') urlPath = '/atlas-layout-admin.html';
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Atlas layout admin: http://127.0.0.1:${port}/atlas-layout-admin.html`);
});
