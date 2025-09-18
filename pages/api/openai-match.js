// pages/api/openai-match.js
// Fully updated for OpenAI Responses API (text.format + json_schema).
// Returns ATS-style scores + cover letter + tailored CV in the same language as the JD.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      job_description = "",
      cv_text = "",
      target = "all",            // "all" | "cover" | "cv"
      model = "gpt-4.1-mini",
      temperature = 0.3,
    } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // Detect language (simple heuristic): if JD or CV has Hebrew letters -> Hebrew.
    const isHeb = /[\u0590-\u05FF]/.test(`${job_description}\n${cv_text}`);
    const LANG = isHeb ? "he" : "en";

    // ---------- Strict JSON Schema (what the model MUST return) ----------
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

    // ---------- System instructions ----------
    const SYSTEM = isHeb
      ? `
אתה עוזר ATS שמבצע התאמה בין מודעת דרושים לקורות־חיים, ומחזיר ציונים (0–100) + מכתב מקדים + קורות־חיים מותאמים.
• כתוב בשפת המודעה (כאן: עברית).
• אל תמציא תארים, חברות או תפקידים שלא הופיעו בקורות־החיים.
• שמור על פורמט ידידותי ל־ATS: כותרות ברורות, bullets קצרים, הישגים מדידים (מספרים/אחוזים).
• החזר אך ורק JSON תקין לפי הסכמה.
      `.trim()
      : `
You are an ATS assistant that matches a job post to a resume and returns scores (0–100) + a cover letter + a tailored resume.
• Write in the same language as the JD (here: English).
• Do not invent degrees / employers / roles not present in the source CV.
• Use ATS-friendly formatting: clear headings, short bullets, measurable outcomes.
• Return ONLY valid JSON per the schema.
      `.trim();

    // ---------- Resume template (forces clean shape) ----------
    const CV_TEMPLATE = isHeb
      ? `# פרטים אישיים
שם מלא: <אם חסר, השאר ריק>
אימייל | טלפון | מיקום | קישורים (LinkedIn/GitHub)

# תקציר מקצועי
• 2–4 שורות שמדגישות התאמה ישירה למשרה.

# מיומנויות מפתח (ATS)
• מיומנות/כלי — רמה / שנות ניסיון
• …
• …

# ניסיון תעסוקתי
תפקיד | חברה | עיר/היברידי | שנים (YYYY–YYYY)
• הישג מדיד 1 (%, מספרים, היקפים)
• הישג מדיד 2
• התאמת מילות מפתח מהמשרה

# השכלה ותעודות
• תואר/קורס | מוסד | שנים | תעודות

# שפות
• עברית — רמה | אנגלית — רמה | נוספות
`
      : `# Contact
Full Name: <leave empty if unknown>
Email | Phone | Location | Links (LinkedIn/GitHub)

# Professional Summary
• 2–4 lines of direct fit to the JD.

# Core Skills (ATS)
• Skill/Tool — level / years
• …
• …

# Experience
Role | Company | City/Hybrid | Years (YYYY–YYYY)
• Measurable outcome 1 (%, numbers, scope)
• Measurable outcome 2
• JD keyword alignment

# Education & Certifications
• Degree/Course | Institution | Years | Certificates

# Languages
• English — level | Others — level
`;

    // ---------- Focus by target ----------
    const FOCUS =
      target === "cv"
        ? (isHeb
            ? "התמקד בהפקת קורות־חיים (tailored_cv). מכתב מקדים מינימלי בלבד."
            : "Focus on tailored_cv; cover_letter can be minimal.")
        : target === "cover"
        ? (isHeb
            ? "התמקד במכתב מקדים (cover_letter). קורות־חיים מינימליים בלבד."
            : "Focus on cover_letter; tailored_cv can be minimal.")
        : (isHeb
            ? "החזר גם cover_letter וגם tailored_cv בצורה מלאה."
            : "Return both cover_letter and tailored_cv in full.");

    // ---------- User input ----------
    const INPUT = [
      isHeb ? "מודעת דרושים:" : "Job Description:",
      job_description,
      "",
      isHeb ? "קורות חיים מקוריים:" : "Original CV:",
      cv_text,
      "",
      isHeb
        ? "הוראות:\n- בצע השוואה בסגנון ATS והחזר ציונים 0..100 בשדות המתאימים.\n- כתוב מכתב מקדים תמציתי (~180 מילים) מותאם למשרה.\n- בנה קורות־חיים לפי התבנית (שמור על הכותרות):"
        : "Instructions:\n- Do an ATS-style comparison and return 0..100 scores in the right fields.\n- Write a concise (~180 words) tailored cover letter.\n- Build the resume exactly with the template (keep headings):",
      CV_TEMPLATE,
      "",
      FOCUS,
      "",
      isHeb
        ? "חשוב: החזר JSON בלבד לפי הסכמה. אין טקסט מחוץ ל־JSON."
        : "Important: return JSON only per the schema. No prose outside JSON.",
    ].join("\n");

    // ---------- Responses API call (text.format + json_schema) ----------
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
            name: "AtsResult",     // ← השם הנדרש לפי הפורמט החדש
            schema,                // ← הסכמה שהגדרנו למעלה
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

    // תחת text.format=json_schema נקבל JSON טהור ב-output_text (או ב-content[] כטקסט)
    const raw =
      data?.output_text ??
      (Array.isArray(data?.content) ? data.content.map((c) => c?.text || "").join("\n") : "") ||
      "";

    let payload;
    try {
      payload = JSON.parse(String(raw));
    } catch {
      // Fallback: אם חזר טקסט לא-JSON נחזיר שלד ריק כדי לא להפיל את ה-UI
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

    // כיבוד ה־target: אם ביקשו רק CV/רק Cover – נרוקן את השני כדי למנוע בלבול ב־UI
    if (target === "cv") payload.cover_letter = "";
    if (target === "cover") payload.tailored_cv = "";

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(400).json({ error: e?.message || "OpenAI request failed" });
  }
}
