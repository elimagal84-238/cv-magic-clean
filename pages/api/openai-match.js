// pages/api/openai-match.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// הופך ערך 0-10 מ־UI ל־0-1 עבור temperature
const toTemp = (n) => {
  const v = Number(n);
  return Math.max(0, Math.min(1, isNaN(v) ? 0.5 : v / 10));
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { job, cv, creativity = 5 } = req.body || {};
  if (!job || !cv) return res.status(400).json({ error: "Missing job or cv" });

  try {
    const temperature = toTemp(creativity);

    const system = `
אתה מסייע בהערכת התאמה בין דרישות משרה לקורות חיים.
החזר JSON בלבד במבנה:
{"score": number (0-100), "why": string, "bullets": string[]}
הנחיות:
- "score" הוא ציון התאמה כולל.
- "why" סיכום קצר (עברית אם הטקסטים בעברית).
- "bullets" רשימת נקודות לשיפור/התאמה (עברית אם רלוונטי).
`;

    const user = `דרישות המשרה:\n${job}\n\nקורות חיים:\n${cv}\n\nהחזר אך ורק JSON חוקי לפי הסכמה למעלה.`;

    // מודל קומפקטי ומהיר; אפשר להחליף ל-gpt-4o אם תרצה
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const text = resp?.choices?.[0]?.message?.content?.trim() || "{}";
    const data = JSON.parse(text);
    res.status(200).json(data);
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "OpenAI error", details: String(err?.message || err) });
  }
}
