import { Router } from "express";
import crypto from "crypto";

const router = Router();
const cache = new Map<string, string>();

function responseText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

router.post("/openai-chat", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "OPENAI_API_KEY is not configured.",
      setup: "Add OPENAI_API_KEY to environment secrets, then restart the server.",
    });
  }

  const payload = req.body;
  if (
    !payload ||
    typeof payload.question !== "string" ||
    !payload.question.trim() ||
    !payload.context ||
    typeof payload.context !== "object"
  ) {
    return res.status(400).json({ error: "Invalid chat payload." });
  }

  const question = payload.question.trim().slice(0, 2000);
  const safePayload = {
    question,
    dashboardContext: payload.context,
    conversation: Array.isArray(payload.history) ? payload.history.slice(-8) : [],
  };

  const cacheKey = crypto
    .createHash("sha256")
    .update(JSON.stringify(safePayload))
    .digest("hex");
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ answer: cached, cached: true });

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        reasoning: { effort: "medium" },
        max_output_tokens: 1100,
        instructions: [
          "You are the Physique 57 India internal operations intelligence chatbot.",
          "Answer leadership and studio-operations questions using only the provided dashboardContext.",
          "Use exact figures from the data when available. Use INR formatting with K, L, or Cr where helpful.",
          "If the answer needs data that is not present, say what is missing and suggest the closest available proxy.",
          "Do not invent members, classes, revenue, dates, or causal claims. Separate facts from recommendations.",
          "Keep answers concise, decision-grade, and specific to the selected studio/month unless the user asks for network or trend context.",
          "Avoid exposing individual member names unless the user explicitly asks for spender/member-level rankings already present in the dashboard context.",
        ].join(" "),
        input: JSON.stringify(safePayload),
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      req.log.error({ status: upstream.status, body: text.slice(0, 500) }, "OpenAI chat failed");
      return res.status(upstream.status).json({ error: "OpenAI request failed." });
    }

    const data = (await upstream.json()) as any;
    const answer = responseText(data);
    if (!answer) return res.status(502).json({ error: "OpenAI returned an empty answer." });

    cache.set(cacheKey, answer);
    return res.json({ answer, cached: false, model: process.env.OPENAI_MODEL || "gpt-4o" });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || "OpenAI chat failed." });
  }
});

export default router;
