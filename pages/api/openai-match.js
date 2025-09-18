// pages/api/openai-match.js
// LLM: מחזיר ציונים + קו״ח מותאם + מכתב מקדים — בלי לשבור את ה־UI הקיים.
// נשמרים בדיוק אותם שמות שדות שה-UI מצפה להם.

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  try {
    const {
      job_description = "",
      cv_text = "",
      target = "all",          // "all" | "cover" | "cv" — ה-UI כבר שולח ערכים אלה
      model_pref = "openai",   // נשמר לתאימות — לא בשימוש פנימי
      temperature = 0.3,       // ה-UI שולח slider/role; פה רק טמפ' נקייה
    } = req.body || {};

    const isHeb = /[\u0590-\u05FF]/.test(`${job_description}\n${cv_text}`);

    // JSON schema שהמודל חייב להחזיר (זה בדיוק מה שה-UI צורך)
    const schema = {
      type: "object",
      additionalProperties: false,
      required: [
        "match_score",
        "keywords_match",
        "requirements_match",
        "experience_match",
        "skills_match",
        "cover_letter",
        "tailored_cv",
      ],
      properties: {
        match_score:        { type: "integer", minimum: 0, maximum: 100 },
        keywords_match:     { type: "integer", minimum: 0, maximum: 100 },
        requirements_match: { type: "integer", minimum: 0, maximum: 100 },
        experience_match:   { type: "integer", minimum: 0, maximum: 100 },
        skills_match:       { type: "integer", minimum: 0, maximum: 100 },
        cover_letter:       { type: "string" },
        tailored_cv:        { type: "string" },
      },
    };

    // תבנית קו״ח מדויקת (ATS-friendly), דו-לשונית לפי שפת ה-JD/CV.
    const CV_TEMPLATE = isHeb
      ? `# כותרת
שם מלא | עיר | טל׳ | מייל | לינקדאין/גיטהאב

# תקציר
2–3 שורות ערך מוסף, כימות הישגים, טכנולוגיות/תחומי ליבה.

# מיומנויות
• תחום 1: מילות מפתח … 
• תחום 2: …

# ניסיון
תפקיד | חברה | שנים (YYYY–YYYY) | עיר/היברידי
• תוצאה מדידה 1 (‎↑‎ הכנסות, ‎↓‎ עלויות, SLA, NPS…)
• מיומנויות/מילות JD משוקפות

# לימודים ותעודות
• תואר/קורס | מוסד | שנים

# שפות
• עברית/אנגלית — רמה`
      : `# Header
Full Name | City | Phone | Email | LinkedIn/GitHub

# Summary
2–3 lines with clear impact, metrics, and core tools.

# Skills
• Area 1: keywords …
• Area 2: …

# Experience
Role | Company | Years (YYYY–YYYY) | City/Hybrid
• Measurable outcome 1
• JD keyword alignment

# Education & Certifications
• Degree/Cert | Institution | Years

# Languages
• English — level | Others — level`;

    // הנחיה למודל: כתיבה בשפת המודעה, בלי המצאות, JSON בלבד.
    const SYSTEM = isHeb
      ? `אתה עוזר ATS. השווה מודעת דרושים לקורות חיים, כתוב בשפת המודעה, אל תמציא תארים/מעסיקים/תפקידים שלא קיימים.
החזר אך ורק JSON בהתאם לסכמה. בנה קו״ח לפי התבנית. `
      : `You are an ATS assistant. Compare JD to CV, write in the JD’s language, never fabricate roles/degrees/employers.
Return ONLY JSON per schema. Build the resume exactly per template.`;

    const USER = [
      isHeb ? "מודעת דרושים:" : "Job Description:", job_description,
      "",
      isHeb ? "קורות חיים מקוריים:" : "Original CV:", cv_text,
      "",
      isHeb
        ? "הוראות: חשב ציונים 0..100 לכל התחומים; כתוב מכתב מקדים (~150–180 מילים); בנה קו״ח מותאם לפי התבנית; אין בדיות."
        : "Instructions: Return 0..100 scores for each field; write a 150–180 word cover letter; build the tailored resume per template; no fabrication.",
      "",
      isHeb ? "תבנית קו״ח:" : "Resume Template:",
      CV_TEMPLATE
    ].join("\n");

    // שימוש ב-chat.completions כדי להיות תואם לסביבתך (אותו מודל כמו openai-chat)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: Math.max(0, Math.min(1, Number(temperature || 0.3))),
        messages: [
          { role: "system", content: SYSTEM + `\nReturn valid JSON matching this schema:\n${JSON.stringify(schema)}` },
          { role: "user", content: USER },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(500).json({ error: `OpenAI error ${r.status}`, details: t.slice(0, 800) });
    }

    const j = await r.json();
    let txt = j?.choices?.[0]?.message?.content || "";
    // ניקוי גדרות קוד אם קיימות
    txt = String(txt).trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    let payload;
    try {
      payload = JSON.parse(txt);
    } catch {
      // ניסיון חילוץ אובייקט JSON אחרון
      const m = txt.match(/\{[\s\S]*\}$/);
      if (m) {
        try { payload = JSON.parse(m[0]); } catch {}
      }
    }
    if (!payload || typeof payload !== "object") {
      return res.status(500).json({ error: "Model did not return valid JSON." });
    }

    // כיבוד target (אם משתמש ביקש רק cover או רק cv)
    if (target === "cv") payload.cover_letter = "";
    if (target === "cover") payload.tailored_cv = "";

    // החזרת השדות בדיוק כפי שה-UI מצפה
    return res.status(200).json({
      match_score:        clamp(payload.match_score),
      keywords_match:     clamp(payload.keywords_match),
      requirements_match: clamp(payload.requirements_match),
      experience_match:   clamp(payload.experience_match),
      skills_match:       clamp(payload.skills_match),
      cover_letter:       String(payload.cover_letter || ""),
      tailored_cv:        String(payload.tailored_cv || ""),
    });
  } catch (e) {
    console.error("openai-match error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

function clamp(n) {
  const x = Math.round(Number(n || 0));
  return Math.max(0, Math.min(100, x));
}
