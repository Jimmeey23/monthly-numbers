const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const HTML_FILE = 'P57_Interactive_Dashboard.html';
const MAX_BODY_BYTES = 48 * 1024;
const cache = new Map();

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 4173);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, body) => {
    if (err) return sendJson(res, err.code === 'ENOENT' ? 404 : 500, { error: 'File not found' });
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function cleanLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.month !== 'string' || typeof payload.studio !== 'string') return false;
  if (!payload.current || typeof payload.current !== 'object') return false;
  return true;
}

function money(v) {
  v = Number(v || 0);
  const sign = v < 0 ? '-' : '';
  v = Math.abs(v);
  if (v >= 10000000) return `${sign}₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `${sign}₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${sign}₹${(v / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(v).toLocaleString('en-IN')}`;
}

function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}

function fallbackLines(payload) {
  const current = payload.current || {};
  const previous = payload.previous || {};
  const leaders = payload.leaders || {};
  const change = (key, type = 'number') => {
    if (previous[key] === undefined || previous[key] === null) return 'no prior-month comparator';
    const delta = Number(current[key] || 0) - Number(previous[key] || 0);
    if (type === 'pct') return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp vs prior month`;
    const base = Math.abs(Number(previous[key] || 0));
    return base ? `${delta >= 0 ? '+' : ''}${((delta / base) * 100).toFixed(1)}% vs prior month` : 'no prior-month comparator';
  };
  return [
    `${payload.studio} closed ${payload.month} at ${money(current.sales)} sales, ${change('sales')}.`,
    `Session revenue was ${money(current.sessionRevenue)}, with class average at ${Number(current.classAvg || 0).toFixed(1)} and fill at ${pct(current.fill)}.`,
    `Acquisition produced ${Math.round(Number(current.newMembers || 0)).toLocaleString('en-IN')} first visits and ${Math.round(Number(current.converted || 0)).toLocaleString('en-IN')} conversions, ${change('conversion', 'pct')}.`,
    `Churn risk was ${pct(current.churn)} across ${Math.round(Number(current.expiring || 0)).toLocaleString('en-IN')} expiring memberships.`,
    `Leading signals: format ${leaders.format || '-'}, class ${leaders.class || '-'}, source ${leaders.source || '-'}, and trainer ${leaders.trainer || '-'}.`,
    `Use this readout as the baseline summary; DeepSeek can refresh it when the API returns a complete generated response.`
  ];
}

async function handleReadout(req, res) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: 'DEEPSEEK_API_KEY is not configured on the server.' });
  }

  try {
    const payload = await readJson(req);
    if (!validatePayload(payload)) return sendJson(res, 400, { error: 'Invalid readout payload.' });

    const cacheKey = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached) return sendJson(res, 200, { lines: cached, cached: true });

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        temperature: 0.2,
        max_tokens: 420,
        stream: false,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content: 'Write 6 concise management readout bullets for a studio dashboard. No markdown. No bold text. Use practical business language. Compare current month with previous month where data is present.'
          },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('DeepSeek request failed', upstream.status, text.slice(0, 500));
      return sendJson(res, 200, { lines: fallbackLines(payload), cached: false, fallback: true, error: 'DeepSeek request failed.' });
    }

    const data = await upstream.json();
    const lines = cleanLines(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
    if (!lines.length) {
      console.error('DeepSeek returned an empty readout', JSON.stringify(data).slice(0, 500));
      return sendJson(res, 200, { lines: fallbackLines(payload), cached: false, fallback: true, error: 'DeepSeek returned an empty readout.' });
    }

    cache.set(cacheKey, lines);
    return sendJson(res, 200, { lines, cached: false });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message || 'Readout generation failed.' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'POST' && url.pathname === '/api/management-readout') return handleReadout(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

  const requested = url.pathname === '/' ? HTML_FILE : decodeURIComponent(url.pathname.slice(1));
  const resolved = path.resolve(ROOT, requested);
  if (!resolved.startsWith(ROOT)) return sendJson(res, 403, { error: 'Forbidden' });
  return sendFile(res, resolved);
});

server.listen(PORT, () => {
  console.log(`P57 dashboard server running at http://localhost:${PORT}`);
});
