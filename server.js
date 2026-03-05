const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORE_FILE = path.join(__dirname, 'current-logo.json');
const IS_VERCEL = process.env.VERCEL === '1';

const defaultApps = ['YouTube', 'Netflix', 'Prime Video', 'Disney+', 'Plex'];

let currentState = {
  logoDataUrl: null,
  appName: 'YouTube',
  updatedAt: null,
  installedApps: defaultApps,
  appsUpdatedAt: null
};

const clients = new Set();

if (!IS_VERCEL && fs.existsSync(STORE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    currentState = {
      logoDataUrl: typeof saved.logoDataUrl === 'string' ? saved.logoDataUrl : null,
      appName: typeof saved.appName === 'string' && saved.appName ? saved.appName : 'YouTube',
      updatedAt: saved.updatedAt || null,
      installedApps: Array.isArray(saved.installedApps) && saved.installedApps.length ? saved.installedApps : defaultApps,
      appsUpdatedAt: saved.appsUpdatedAt || null
    };
  } catch (error) {
    console.error('Failed to load saved state:', error.message);
  }
}

function persistState() {
  if (IS_VERCEL) return;
  fs.writeFileSync(STORE_FILE, JSON.stringify(currentState, null, 2));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function toClientState(state) {
  return {
    ...state,
    currentLogo: state.logoDataUrl,
    knownApps: state.installedApps
  };
}

function broadcastLogoUpdate() {
  const eventPayload = `event: logo\ndata: ${JSON.stringify(toClientState(currentState))}\n\n`;
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

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logo') {
    sendJson(res, 200, toClientState(currentState));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/apps') {
    sendJson(res, 200, { apps: currentState.installedApps, knownApps: currentState.installedApps, updatedAt: currentState.appsUpdatedAt });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/apps') {
    try {
      const body = await parseBody(req);
      const incomingApps = Array.isArray(body.apps) ? body.apps
        : Array.isArray(body.installedApps) ? body.installedApps
        : Array.isArray(body.knownApps) ? body.knownApps
        : [];
      const normalizedApps = [...new Set(incomingApps
        .filter((app) => typeof app === 'string')
        .map((app) => app.trim())
        .filter(Boolean))].slice(0, 300);

      if (!normalizedApps.length) {
        sendJson(res, 400, { error: 'apps must be a non-empty string array.' });
        return;
      }

      currentState.installedApps = normalizedApps;
      currentState.appsUpdatedAt = new Date().toISOString();
      persistState();

      sendJson(res, 200, { success: true, count: normalizedApps.length });
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'App sync failed.' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/logo') {
    try {
      const body = await parseBody(req);
      const logoDataUrl = body.logoDataUrl || body.currentLogo;
      const requestedAppName = body.appName || body.targetApp;
      const appName = typeof requestedAppName === 'string' && requestedAppName.trim() ? requestedAppName.trim() : 'YouTube';

      if (typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
        sendJson(res, 400, { error: 'logoDataUrl must be a valid image data URL.' });
        return;
      }

      currentState.logoDataUrl = logoDataUrl;
      currentState.appName = appName;
      currentState.updatedAt = new Date().toISOString();
      if (!currentState.installedApps.includes(appName)) {
        currentState.installedApps = [...currentState.installedApps, appName];
      }

      persistState();
      broadcastLogoUpdate();
      sendJson(res, 200, { success: true, persisted: !IS_VERCEL, appName: currentState.appName });
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
    res.write(`event: logo\ndata: ${JSON.stringify(toClientState(currentState))}\n\n`);

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
