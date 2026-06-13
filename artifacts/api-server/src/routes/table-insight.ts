import { Router } from "express";
import crypto from "crypto";

const router = Router();
const cache = new Map<string, string>();

function money(v: number): string {
  const sign = v < 0 ? "-" : "";
  v = Math.abs(v);
  if (v >= 10000000) return `${sign}₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `${sign}₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${sign}₹${(v / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(v).toLocaleString("en-IN")}`;
}

function normalizeRevenueUnits(line: string): string {
  const revenueContext =
    /\b(sales|revenue|value|atv|auv|ltv|cash|billing|receipt|income|gross|net|rupee|inr|₹|rs\.?)\b/i;
  if (!revenueContext.test(line)) return line;
  return String(line).replace(
    /(?:₹|rs\.?|inr)?\s*(-?\d+(?:\.\d+)?)\s*(?:million|mn|m)\b/gi,
    (_, n) => money(Number(n) * 1000000)
  );
}

function cleanInsight(text: string): string {
  return normalizeRevenueUnits(
    String(text || "")
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, 520);
}

function tableContext(payload: Record<string, any>) {
  const headers: string[] = payload.headers || [];
  const rows: any[][] = (payload.rows || []).slice(0, 8);
  const numericColumns = headers
    .map((header, index) => {
      const values = rows
        .map((row) => {
          const raw = Array.isArray(row) ? row[index] : "";
          const value = Number(
            String(raw ?? "").replace(/[₹,%x,LKCr,\s]/gi, "")
          );
          return Number.isFinite(value) ? value : null;
        })
        .filter((v): v is number => v !== null);
      if (!values.length) return null;
      return {
        header,
        max: Math.max(...values),
        min: Math.min(...values),
        spread: Math.max(...values) - Math.min(...values),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.spread - a.spread)
    .slice(0, 3);
  return {
    tablePurpose: `Explain what ${payload.title} means for ${payload.studio || "the selected studio"} in ${payload.month || "the selected month"}.`,
    likelyDecision:
      "Identify the operating decision, risk, or follow-up action implied by the table.",
    visibleRows: rows.length,
    largestSpreads: numericColumns,
  };
}

router.post("/table-insight", async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res
      .status(503)
      .json({ error: "DEEPSEEK_API_KEY is not configured." });
  }

  const payload = req.body;
  if (
    !payload ||
    typeof payload.tableId !== "string" ||
    typeof payload.title !== "string" ||
    !Array.isArray(payload.headers) ||
    !Array.isArray(payload.rows)
  ) {
    return res.status(400).json({ error: "Invalid table insight payload." });
  }

  const cacheKey = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ insight: cached, cached: true });

  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        temperature: 0.2,
        max_tokens: 210,
        stream: false,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: [
              "Write one decision-grade dashboard table insight for studio operators.",
              'Start with "Key insight:". No markdown. Use plain English.',
              "Do not just name the top row or restate the table. Explain the pattern, why it matters, and the action or risk.",
              "Use 2 short sentences, 35-60 words total. If there is a concentration, gap, weak conversion, churn risk, or scheduling opportunity, say so.",
              "Use only K, L, or Cr for rupee values; never use million, mn, or m.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({ ...payload, context: tableContext(payload) }),
          },
        ],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      req.log.error({ status: upstream.status, body: text.slice(0, 500) }, "DeepSeek table insight failed");
      return res.json({
        insight: payload.fallback || "Key insight: Table data is available for review.",
        cached: false,
        fallback: true,
      });
    }

    const data = (await upstream.json()) as any;
    let insight = cleanInsight(data?.choices?.[0]?.message?.content || "");
    if (!insight)
      insight = payload.fallback || "Key insight: Table data is available for review.";
    if (!/^key insight:/i.test(insight)) insight = `Key insight: ${insight}`;
    cache.set(cacheKey, insight);
    return res.json({ insight, cached: false });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || "Table insight generation failed." });
  }
});

export default router;
