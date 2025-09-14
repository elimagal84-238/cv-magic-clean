// pages/api/openai-match.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { model = "gpt-4o-mini", temperature = 0.4, prompt } = req.body || {};
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const openaiUrl = "https://api.openai.com/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };

  const system = [
    "You are an ATS-style evaluator and resume rewriter.",
    "Return STRICT JSON with keys: analysis, adapted_cv, cover_letter.",
    "analysis must include: match_score (0-100 int), strengths [], gaps [], recommendations [].",
    "Do NOT add any prose before/after the JSON. JSON only."
  ].join(" ");

  // First try: force JSON mode (best). If the model doesn't support it, fallback.
  const bodyJsonMode = {
    model,
    temperature,
    max_tokens: 1400,
    response_format: { type: "json_object" }, // <— מחייב JSON
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
  };

  async function callOpenAI(body) {
    const r = await fetch(openaiUrl, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* keep raw text */ }
    return { ok: r.ok, status: r.status, data, text };
  }

  try {
    // Attempt 1: JSON mode
    let resp = await callOpenAI(bodyJsonMode);

    // Fallback if model doesn't support response_format or any 400 schema error
    const unsupported =
      resp.status === 400 &&
      (resp.text.includes("response_format") || resp.text.includes("json_object"));

    if (!resp.ok && unsupported) {
      const bodyFallback = {
        model,
        temperature,
        max_tokens: 1400,
        messages: [
          { role: "system", content: system + " Output MUST be a single JSON object. No code fences." },
          { role: "user", content: prompt }
        ],
      };
      resp = await callOpenAI(bodyFallback);
    }

    if (!resp.ok) {
      // העברת הודעת שגיאה ברורה קדימה
      const payload = resp.data || { error: resp.text || "Upstream error" };
      return res.status(resp.status).json(payload);
    }

    const content = resp.data?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

