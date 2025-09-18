// pages/api/openai-match.js
// Works with OpenAI Responses API (text.format + json_schema).
// Returns ATS-style scores + cover letter + tailored CV.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      job_description = "",
      cv_text = "",
      target = "all",                 // "all" | "cover" | "cv"
      model = "gpt-4.1-mini",
      temperature = 0.3,
    } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // Simple language detection (Hebrew vs. English)
    const isHeb = /[\u0590-\u05FF]/.test(`${job_description}\n${cv_text}`);

    // ---- Strict JSON schema (model MUST return this) ----
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

    // ---- System instructions ----
    const SYSTEM = isHeb
      ? `אתה עוזר ATS המשווה מודעת דרושים לקורות־חיים, מחזיר ציונים (0–100) + מכתב מקדים + קו״ח מותאמים.
• כתוב בשפת המודעה (כאן: עברית).
• אל תמציא תארים/מעסיקים/תפקידים שלא הופיעו בקו״ח.
• שמור על פורמט ידידותי ל-ATS: כותרות ברורות, bullets קצרים, הישגים מדידים.
• החזר אך ורק JSON לפי הסכמה.`
      : `You are an ATS assistant that matches a job post to a resume and returns scores (0–100), a cover letter and a tailored resume.
• Write in the JD language (here: English).
• Do NOT invent degrees/employers/roles not present in the source CV.
• Use ATS-friendly formatting.
• Return ONLY JSON per the schema.`;

    const CV_TEMPLATE = isHeb
      ? `# פרטים אישיים
שם מלא: <אם חסר, השאר ריק>
אימייל | טלפון | מיקום | קישורים

# תקציר מקצועי
• 2–4 שורות שמדגישות התאמה ישירה.

# מיומנויות מפתח (ATS)
• מיומנות/כלי — רמה / שנות ניסיון
• …

# ניסיון תעסוקתי
תפקיד | חברה | עיר/היברידי | שנים (YYYY–YYYY)
• הישג מדיד 1
• הישג מדיד 2
• התאמת מילות מפתח

# השכלה ותעודות
• תואר/קורס | מוסד | שנים

# שפות
• עברית — רמה | אנגלית — רמה`
      : `# Contact
Full Name: <empty if unknown>
Email | Phone | Location | Links

# Professional Summary
• 2–4 lines of direct fit.

# Core Skills (ATS)
• Skill/Tool — level / years
• …

# Experience
Role | Company | City/Hybrid | Years (YYYY–YYYY)
• Measurable outcome 1
• Measurable outcome 2
• JD keyword alignment

# Education & Certifications
• Degree/Course | Institution | Years

# Languages
• English — level | Others — level`;

    const FOCUS =
      target === "cv"
        ? (isHeb ? "התמקד ב־tailored_cv; מכתב מינימלי." : "Focus on tailored_cv; cover letter minimal.")
        : target === "cover"
        ? (isHeb ? "התמקד במכתב; קו״ח מינימליים."       : "Focus on cover_letter; resume minimal.")
        : (isHeb ? "החזר גם מכתב וגם קו״ח מלאים."       : "Return both cover_letter and tailored_cv.");

    const INPUT = [
      isHeb ? "מודעת דרושים:" : "Job Description:",
      job_description,
      "",
      isHeb ? "קורות־חיים מקוריים:" : "Original CV:",
      cv_text,
      "",
      isHeb
        ? "הוראות: בצע התאמה בסגנון ATS והחזר ציונים 0..100 בשדות הנכונים; מכתב מקדים (~180 מילים); בנה קו״ח לפי התבנית:"
        : "Instructions: ATS-style scoring 0..100; concise cover letter (~180 words); build resume exactly per template:",
      CV_TEMPLATE,
      "",
      FOCUS,
      "",
      isHeb ? "חשוב: החזר JSON בלבד לפי הסכמה." : "Important: return JSON only per the schema.",
    ].join("\n");

    // ---- Responses API call (text.format + json_schema) ----
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        text: {
          format: {
            type: "json_schema",
            name: "AtsResult",
            schema,
            strict: true,
          },
        },
        input: `${SYSTEM}\n\n${INPUT}`,
        max_output_tokens: 3000,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `OpenAI error (${r.status})`;
      return res.status(400).json({ error: msg });
    }

    // ---- SAFE extraction (בלי לערבב ?? עם ||) ----
    let raw = "";
    if (typeof data?.output_text === "string") {
      raw = data.output_text;
    } else if (Array.isArray(data?.content)) {
      raw = data.content.map((c) => (c?.text ?? "")).join("\n");
    } else if (Array.isArray(data?.output)) {
      raw = data.output
        .map((o) =>
          Array.isArray(o?.content) ? o.content.map((c) => (c?.text ?? "")).join("\n") : ""
        )
        .join("\n");
    }

    let payload;
    try {
      payload = JSON.parse(String(raw || ""));
    } catch {
      // Fallback skeleton to avoid crashing the UI
      payload = {
        match_score: 0,
        keywords_match: 0,
        requirements_match: 0,
        experience_match: 0,
        skills_match: 0,
        cover_letter: "",
        tailored_cv: "",
      };
    }

    // Respect target
    if (target === "cv") payload.cover_letter = "";
    if (target === "cover") payload.tailored_cv = "";

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(400).json({ error: e?.message || "OpenAI request failed" });
  }
}
