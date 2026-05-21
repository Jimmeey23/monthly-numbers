const crypto = require('crypto');

const MAX_BODY_BYTES = 48 * 1024;
const cache = global.__p57ReadoutCache || new Map();
global.__p57ReadoutCache = cache;

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
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
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.month === 'string' &&
    typeof payload.studio === 'string' &&
    payload.current &&
    typeof payload.current === 'object'
  );
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return sendJson(res, 503, { error: 'DEEPSEEK_API_KEY is not configured in Vercel environment variables.' });

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
};
