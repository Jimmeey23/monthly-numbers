import { Router } from "express";
import crypto from "crypto";

const router = Router();

const cache = new Map<string, string[]>();
const MAX_BODY_BYTES = 48 * 1024;

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

function pct(v: number): string {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}

function cleanLines(text: string): string[] {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .map(normalizeRevenueUnits)
    .filter(Boolean)
    .slice(0, 8);
}

function fallbackLines(payload: Record<string, any>): string[] {
  const current = payload.current || {};
  const previous = payload.previous || {};
  const leaders = payload.leaders || {};
  const risks = payload.risks || {};
  const change = (key: string, type = "number") => {
    if (previous[key] === undefined || previous[key] === null)
      return "no prior-month comparator";
    const delta = Number(current[key] || 0) - Number(previous[key] || 0);
    if (type === "pct")
      return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp vs prior month`;
    const base = Math.abs(Number(previous[key] || 0));
    return base
      ? `${delta >= 0 ? "+" : ""}${((delta / base) * 100).toFixed(1)}% vs prior month`
      : "no prior-month comparator";
  };
  return [
    `Read: ${payload.studio} ended ${payload.month} at ${money(current.sales)} sales, ${change("sales")}, which makes revenue momentum the first operating story to explain.`,
    `Driver: ${leaders.format?.name || leaders.format || "-"} appears to be carrying the schedule, so protect its best slots before adding lower-yield capacity.`,
    `Demand: Fill was ${pct(current.fill)} with class average ${Number(current.classAvg || 0).toFixed(1)}, ${change("fill", "pct")}; the issue is quality of occupancy, not only class count.`,
    `Acquisition: ${Math.round(Number(current.newMembers || 0)).toLocaleString("en-IN")} first visits became ${Math.round(Number(current.converted || 0)).toLocaleString("en-IN")} conversions, ${change("conversion", "pct")}, so follow-up quality needs as much attention as lead volume.`,
    `Retention: Churn risk was ${pct(current.churn)} across ${Math.round(Number(current.expiring || 0)).toLocaleString("en-IN")} expiring memberships; prioritize members with low recent usage before expiry.`,
    `Action: Focus the next week on ${risks.primaryAction || "protecting high-demand formats, recovering weak conversion paths, and tightening renewal outreach"}.`,
  ];
}

router.post("/management-readout", async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res
      .status(503)
      .json({ error: "DEEPSEEK_API_KEY is not configured." });
  }

  const payload = req.body;
  if (
    !payload ||
    typeof payload.month !== "string" ||
    typeof payload.studio !== "string" ||
    !payload.current
  ) {
    return res.status(400).json({ error: "Invalid readout payload." });
  }

  const cacheKey = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ lines: cached, cached: true });

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
        max_tokens: 420,
        stream: false,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: [
              "You are a senior Physique 57 India operations intelligence analyst writing for studio leadership.",
              "Write exactly 6 plain-English management readout lines. No markdown. No bold text. No headings except these line prefixes: Read:, Driver:, Demand:, Acquisition:, Retention:, Action:.",
              "Do not merely restate metrics. Explain what the numbers imply, why it matters, and what the team should do next.",
              "Use current vs previous month only where provided. Call out tradeoffs, risks, constraints, and one concrete next action.",
              "Each line should be 18-32 words. Use only K, L, or Cr for rupee values; never use million, mn, or m.",
            ].join(" "),
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      req.log.error({ status: upstream.status, body: text.slice(0, 500) }, "DeepSeek request failed");
      return res.json({
        lines: fallbackLines(payload),
        cached: false,
        fallback: true,
        error: "DeepSeek request failed.",
      });
    }

    const data = (await upstream.json()) as any;
    const lines = cleanLines(
      data?.choices?.[0]?.message?.content || ""
    );
    if (!lines.length) {
      req.log.error({ data: JSON.stringify(data).slice(0, 500) }, "DeepSeek returned empty readout");
      return res.json({
        lines: fallbackLines(payload),
        cached: false,
        fallback: true,
        error: "DeepSeek returned an empty readout.",
      });
    }

    cache.set(cacheKey, lines);
    return res.json({ lines, cached: false });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || "Readout generation failed." });
  }
});

export default router;
