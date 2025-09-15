// pages/api/openai-match.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { model = "gpt-4.1-mini", temperature = 0.5, prompt } = req.body || {};
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing prompt" });
  }

  // הוראות קשיחות ל-JSON (נצרף לפני הפרומפט שמגיע מהלקוח)
  const STRICT_HEADER = `
You are an ATS-style evaluator and resume rewriter.
Return STRICT JSON with keys: analysis, adapted_cv, cover_letter.

analysis must include:
- match_score (0-100, integer)
- strengths (string[])
- gaps (string[])
- recommendations (string[])
- skills_match (0-100, integer)
- experience_match (0-100, integer)
- keywords_match (0-100, integer)

Rules:
- Output MUST be a single JSON object only (no markdown, no prose).
- Be concise and concrete. Bullet points are welcome.
- Preserve truthful facts; do not invent employment or education.
- Write outputs in the SAME language as the JOB POSTING.
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
        input: inputText, // אין כאן reasoning/effect ואחרים שגרמו ל-400
        max_output_tokens: 2048,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `OpenAI error (${r.status})`;
      throw new Error(msg);
    }

    // תמיכה בווריאציות שונות של תגובת ה-Responses API
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

  function extractLastJsonObject(s) {
    if (!s) return "";
    // חיתוך לאובייקט JSON אחרון במחרוזת (אם יש טקסט מסביב)
    const m = String(s).match(/\{[\s\S]*\}$/);
    return m ? m[0] : s;
  }

  try {
    // קריאה ראשונה — עם הכותרת הקשיחה + הפרומפט מהלקוח
    const firstText = await callOpenAI(`${STRICT_HEADER}\n\n${prompt}`.trim());
    let content = extractLastJsonObject(firstText);

    // אם לא נראה כמו JSON—נבקש תיקון אוטומטי מהמודל (pass שני קצר)
    let looksJson = content.trim().startsWith("{") && content.trim().endsWith("}");
    if (!looksJson) {
      const repairPrompt = `
You will receive a model output that is NOT valid strict JSON.
Convert it to a SINGLE strict JSON object that matches the schema described earlier.
Do NOT add any explanations or markdown — only the JSON.

TEXT TO FIX:
${firstText}
`.trim();

      const repaired = await callOpenAI(repairPrompt);
      content = extractLastJsonObject(repaired);
    }

    // מחזירים תמיד מחרוזת JSON (הקליינט מבצע parse)
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "OpenAI request failed" });
  }
}
