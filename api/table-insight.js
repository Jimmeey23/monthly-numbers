const crypto = require('crypto');

const MAX_BODY_BYTES = 64 * 1024;
const cache = global.__p57TableInsightCache || new Map();
global.__p57TableInsightCache = cache;

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

function money(v) {
  v = Number(v || 0);
  const sign = v < 0 ? '-' : '';
  v = Math.abs(v);
  if (v >= 10000000) return `${sign}₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `${sign}₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${sign}₹${(v / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(v).toLocaleString('en-IN')}`;
}

function normalizeRevenueUnits(line) {
  const revenueContext = /\b(sales|revenue|value|atv|auv|ltv|cash|billing|receipt|income|gross|net|rupee|inr|₹|rs\.?)\b/i;
  if (!revenueContext.test(line)) return line;
  return String(line).replace(/(?:₹|rs\.?|inr)?\s*(-?\d+(?:\.\d+)?)\s*(?:million|mn|m)\b/gi, (_, n) => money(Number(n) * 1000000));
}

function cleanInsight(text) {
  return normalizeRevenueUnits(String(text || '')
    .split(/\n+/)
    .map(line => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()).slice(0, 360);
}

function validatePayload(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.tableId === 'string' &&
    typeof payload.title === 'string' &&
    Array.isArray(payload.headers) &&
    Array.isArray(payload.rows)
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return sendJson(res, 503, { error: 'DEEPSEEK_API_KEY is not configured in Vercel environment variables.' });

  try {
    const payload = await readJson(req);
    if (!validatePayload(payload)) return sendJson(res, 400, { error: 'Invalid table insight payload.' });

    const cacheKey = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached) return sendJson(res, 200, { insight: cached, cached: true });

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        temperature: 0.15,
        max_tokens: 140,
        stream: false,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content: 'Write one concise dashboard table key insight. Start with "Key insight:". No markdown. Use only K, L, or Cr for any rupee/revenue values; never use million, mn, or m. Mention the main leader, gap, risk, or action implied by the table.'
          },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('DeepSeek table insight failed', upstream.status, text.slice(0, 500));
      return sendJson(res, 200, { insight: payload.fallback || 'Key insight: Table data is available for review.', cached: false, fallback: true });
    }

    const data = await upstream.json();
    let insight = cleanInsight(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
    if (!insight) insight = payload.fallback || 'Key insight: Table data is available for review.';
    if (!/^key insight:/i.test(insight)) insight = `Key insight: ${insight}`;
    cache.set(cacheKey, insight);
    return sendJson(res, 200, { insight, cached: false });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message || 'Table insight generation failed.' });
  }
};
