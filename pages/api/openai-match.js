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
    "Return STRICT JSON with top-level keys: analysis, adapted_cv, cover_letter.",
    "analysis must include: match_score (0-100 int), strengths (string[]), gaps (string[]), recommendations (string[]).",
    "NO prose, NO code fences, JSON only."
  ].join(" ");

  function bodyJsonMode(userPrompt) {
    return {
      model,
      temperature,
      max_tokens: 1600,
      response_format: { type: "json_object" }, // נסיון מחייב JSON
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    };
  }

  function bodyFallback(userPrompt) {
    return {
      model,
      temperature,
      max_tokens: 1600,
      messages: [
        { role: "system", content: system + " Output MUST be a single JSON object. No code fences." },
        { role: "user", content: userPrompt },
      ],
    };
  }

  async function callOpenAI(body) {
    const r = await fetch(openaiUrl, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, data, text };
  }

  function tryParse(payload) {
    if (!payload) return null;
    if (typeof payload === "object") return payload;
    try { return JSON.parse(payload); } catch {}
    // נסיון לחלץ אובייקט אחרון במחרוזת
    const m = String(payload).match(/\{[\s\S]*\}$/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }

  async function jsonRepair(rawContent) {
    const schemaHint = `
Return ONLY a valid JSON object with keys:
{
  "analysis": {
    "match_score": 0,
    "strengths": [],
    "gaps": [],
    "recommendations": []
  },
  "adapted_cv": "",
  "cover_letter": ""
}
If any field is missing, add it with sensible defaults. Do NOT include backticks or text outside JSON.`;
    const body = {
      model,
      temperature: 0, // תיקון דטרמיניסטי
      max_tokens: 1200,
      messages: [
        { role: "system", content: "You convert messy text into STRICT valid JSON. No extra text." },
        { role: "user", content: `Fix the following into STRICT JSON.\n\n${schemaHint}\n\n=== INPUT START ===\n${rawContent}\n=== INPUT END ===` }
      ],
    };
    const repaired = await callOpenAI(body);
    if (!repaired.ok) return null;
    const fixed = repaired.data?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParse(fixed);
    return parsed ? JSON.stringify(parsed) : null;
  }

  try {
    // ניסיון 1: JSON mode
    let resp = await callOpenAI(bodyJsonMode(prompt));

    // אם המודל לא תומך ב-json_object → fallback
    const unsupported =
      resp.status === 400 &&
      (resp.text.includes("response_format") || resp.text.includes("json_object"));

    if (!resp.ok && unsupported) {
      resp = await callOpenAI(bodyFallback(prompt));
    }

    if (!resp.ok) {
      // טעינת שגיאת מכסה/אחרת כמו שהיא
      return res.status(resp.status).json(resp.data || { error: resp.text || "Upstream error" });
    }

    // שלב פירסור
    const content = resp.data?.choices?.[0]?.message?.content ?? "";
    let parsed = tryParse(content);

    // ניסיון תיקון אוטומטי אם לא JSON
    if (!parsed) {
      const fixed = await jsonRepair(content);
      if (fixed) return res.status(200).json({ content: fixed });
      // נסיון אחרון: תיקון ישירות מהפרומפט (אם המודל התעלם ממנו)
      const fixed2 = await jsonRepair(prompt + "\n\n---\nMODEL OUTPUT:\n" + content);
      if (fixed2) return res.status(200).json({ content: fixed2 });
      return res.status(502).json({ error: "model_returned_non_json" });
    }

    return res.status(200).json({ content: JSON.stringify(parsed) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

