#!/usr/bin/env node
/**
 * Offline Connect Server
 * HTTP-сервер для раздачи React-сайта + WebSocket для офлайн-чата в Wi‑Fi сети (например Huawei E5573).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../client/dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getLocalIPs() {
  try {
    const ifaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  } catch (_) {
    return [];
  }
}

function serveFile(filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  return { content: fs.readFileSync(filePath), contentType };
}

// --- HTTP server (static site) ---
const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0];
  if (urlPath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const filePath = path.join(PUBLIC_DIR, urlPath);

  if (!fs.existsSync(PUBLIC_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline Connect</title></head><body>' +
      '<h1>Сайт не собран</h1><p>Выполните в корне проекта: <code>cd client && npm run build</code></p></body></html>'
    );
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const indexFallback = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexFallback)) {
      const { content, contentType } = serveFile(indexFallback);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  try {
    const { content, contentType } = serveFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// --- WebSocket chat ---
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> { id, name }

function randomName() {
  return 'User_' + Math.random().toString(36).slice(2, 8);
}

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 12);
  const name = randomName();
  clients.set(ws, { id, name });

  ws.send(JSON.stringify({ type: 'hello', id, name }));
  broadcast({ type: 'join', id, name }, ws);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'message' && typeof data.text === 'string') {
        const meta = clients.get(ws);
        const payload = {
          type: 'message',
          id: meta.id,
          name: meta.name,
          text: data.text.slice(0, 2000),
          time: Date.now(),
        };
        broadcast(payload);
      }
      if (data.type === 'rename' && typeof data.name === 'string' && data.name.trim()) {
        const meta = clients.get(ws);
        const oldName = meta.name;
        meta.name = data.name.trim().slice(0, 32);
        broadcast({ type: 'rename', id: meta.id, oldName, name: meta.name }, ws);
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (meta) {
      broadcast({ type: 'leave', id: meta.id, name: meta.name });
      clients.delete(ws);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('');
  console.log('  Offline Connect Server');
  console.log('  ----------------------');
  console.log(`  Порт: ${PORT}`);
  console.log('');
  console.log('  Откройте в браузере (устройства в той же Wi‑Fi сети):');
  ips.forEach((ip) => console.log(`    http://${ip}:${PORT}`));
  if (ips.length === 0) console.log('    (локальные IP не найдены)');
  console.log('');
});
