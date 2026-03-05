const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORE_FILE = path.join(__dirname, 'current-logo.json');
const IS_VERCEL = process.env.VERCEL === '1';

let currentLogo = null;
const clients = new Set();

if (!IS_VERCEL && fs.existsSync(STORE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (saved?.logoDataUrl && typeof saved.logoDataUrl === 'string') {
      currentLogo = saved.logoDataUrl;
    }
  } catch (error) {
    console.error('Failed to load saved logo:', error.message);
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function broadcastLogoUpdate() {
  const eventPayload = `event: logo\ndata: ${JSON.stringify({ logoDataUrl: currentLogo })}\n\n`;
  for (const client of clients) {
    client.write(eventPayload);
  }
}

function serveFile(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeMap[extension] || 'application/octet-stream');
    res.setHeader('Content-Length', data.length);
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > 6 * 1024 * 1024) {
        reject(new Error('Payload too large. Keep files under ~4MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(raw || '{}');
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (error) => reject(error));
  });
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/') {
    serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logo') {
    sendJson(res, 200, { logoDataUrl: currentLogo });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/logo') {
    try {
      const body = await parseBody(req);
      const logoDataUrl = body.logoDataUrl;

      if (typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
        sendJson(res, 400, { error: 'logoDataUrl must be a valid image data URL.' });
        return;
      }

      currentLogo = logoDataUrl;
      if (!IS_VERCEL) {
        fs.writeFileSync(STORE_FILE, JSON.stringify({ logoDataUrl: currentLogo }, null, 2));
      }
      broadcastLogoUpdate();

      sendJson(res, 200, { success: true, persisted: !IS_VERCEL });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Upload failed.' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`event: logo\ndata: ${JSON.stringify({ logoDataUrl: currentLogo })}\n\n`);

    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const filePath = path.join(PUBLIC_DIR, url.pathname.replace(/^\/+/, ''));
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Google TV logo changer running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = requestHandler;
