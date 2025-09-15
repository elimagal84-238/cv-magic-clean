// pages/api/openai-match.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { model = "gpt-4.1-mini", temperature = 0.5, prompt } = req.body || {};
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Missing prompt" });

  // JSON Schema מחייב – זה מה שהמודל חייב להחזיר
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["analysis", "adapted_cv", "cover_letter"],
    properties: {
      analysis: {
        type: "object",
        additionalProperties: false,
        required: [
          "match_score",
          "strengths",
          "gaps",
          "recommendations",
          "skills_match",
          "experience_match",
          "keywords_match"
        ],
        properties: {
          match_score: { type: "integer", minimum: 0, maximum: 100 },
          strengths: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
          skills_match: { type: "integer", minimum: 0, maximum: 100 },
          experience_match: { type: "integer", minimum: 0, maximum: 100 },
          keywords_match: { type: "integer", minimum: 0, maximum: 100 }
        }
      },
      adapted_cv: { type: "string" },
      cover_letter: { type: "string" }
    }
  };

  // הנחיות קצרות – אבל אין צורך ב״תיקונים״ אח״כ כי הסכמה סוגרת קצוות
  const SYSTEM_HEADER = `
You are an ATS-style evaluator and resume rewriter.
Write outputs in the SAME language as the JOB POSTING.
Be concise and concrete. Do not invent education or employment.
`.trim();

  async function callOpenAI(inputText) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        // כופה החזרה בדיוק לפי הסכמה למטה
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "MatchResult",
            strict: true,
            schema
          }
        },
        // מותר להעביר מחרוזת ישירות בשדה input ב-Responses API
        input: `${SYSTEM_HEADER}\n\n${inputText}`,
        max_output_tokens: 2048
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `OpenAI error (${r.status})`;
      throw new Error(msg);
    }

    // איסוף טקסט – תחת response_format json_schema המודל מחזיר JSON טהור
    const text =
      data.output_text ??
      (Array.isArray(data.content) ? data.content.map((c) => c.text).join("\n") : "") ??
      (Array.isArray(data.output)
        ? data.output
            .map((o) => (Array.isArray(o.content) ? o.content.map((c) => c.text).join("\n") : ""))
            .join("\n")
        : "") ??
      "";

    return String(text || "");
  }

  try {
    const content = await callOpenAI(prompt);

    // החזרה לקליינט: מחרוזת JSON תקינה (הקוד בצד לקוח עושה JSON.parse)
    return res.status(200).json({ content });
  } catch (e) {
    // אם יש עדיין בעיה – נחזיר 400 עם פירוט
    return res.status(400).json({ error: e?.message || "OpenAI request failed" });
  }
}
