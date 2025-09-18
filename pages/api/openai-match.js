// pages/api/openai-match.js
// Unified: strict JSON schema + JD/CV inputs + ATS scores + Cover + Tailored CV.

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      job_description = "",
      cv_text = "",
      target = "all",          // "all" | "cover" | "cv"
      model = "gpt-4.1-mini",  // נשאר תואם ל-Responses API
      temperature = 0.3,
    } = req.body || {};

    if (!process.env.OPENAI_API_KEY)
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    // זיהוי שפה אוטומטי (ברירת מחדל עברית אם יש אותיות עבריות)
    const isHeb = /[\u0590-\u05FF]/.test(`${job_description}\n${cv_text}`);
    const LANG = isHeb ? "he" : "en";

    // ---------- JSON Schema מחייב ----------
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
        match_score: { type: "integer", minimum: 0, maximum: 100 },
        keywords_match: { type: "integer", minimum: 0, maximum: 100 },
        requirements_match: { type: "integer", minimum: 0, maximum: 100 },
        experience_match: { type: "integer", minimum: 0, maximum: 100 },
        skills_match: { type: "integer", minimum: 0, maximum: 100 },
        cover_letter: { type: "string" },
        tailored_cv: { type: "string" },
      },
    };

    // ---------- System header ----------
    const SYSTEM = isHeb
      ? `
אתה עוזר ATS שמבצע התאמה בין מודעת דרושים לקורות-חיים, ומחזיר ציונים (0–100) + מכתב מקדים + קורות-חיים מותאמים.
תחזיר אך ורק JSON לפי הסכמה. אל תמציא תארים או מקומות עבודה.
השב בעברית תקנית ובפורמט ידידותי ל-ATS (כותרות ברורות, bullets קצרים, הישגים מדידים).
    `.trim()
      : `
You are an ATS assistant that matches a job post to a resume and returns scores (0–100) + a cover letter + a tailored resume.
Return JSON ONLY that conforms to the schema. Do not invent degrees or employers.
Use ATS-friendly formatting (clear headings, short bullets, measurable outcomes).
    `.trim();

    // ---------- תבנית קו״ח קשיחה ----------
    const CV_TEMPLATE = isHeb
      ? `# פרטים אישיים
שם מלא: <אם חסר, השאר ריק>
אימייל | טלפון | מיקום | קישורים (LinkedIn/GitHub)

# תקציר מקצועי
• 2–4 שורות מסכמות התאמה ישירה למשרה.

# מיומנויות מפתח (ATS)
• מיומנות/טכנולוגיה — רמת שליטה / שנות ניסיון
• …
• …

# ניסיון תעסוקתי
תפקיד | חברה | עיר/היברידי | שנים (YYYY–YYYY)
• הישג מדיד 1 (%, מספרים, היקפים)
• הישג מדיד 2
• שילוב מילות מפתח רלוונטיות מהמשרה

תפקיד | חברה | שנים
• …

# השכלה ותעודות
• תואר/קורס | מוסד | שנים | תעודות

# שפות
• עברית — רמה | אנגלית — רמה | נוספות

# פרויקטים/התנדבות (אופציונלי)
• פרויקט — תוצאה/ערך ב-1–2 bullets
`
      : `# Contact
Full Name: <leave empty if unknown>
Email | Phone | Location | Links (LinkedIn/GitHub)

# Professional Summary
• 2–4 lines showing direct fit to this JD.

# Core Skills (ATS)
• Skill/Tool — level / years
• …
• …

# Experience
Role | Company | City/Hybrid | Years (YYYY–YYYY)
• Measurable outcome 1 (%, numbers, scope)
• Measurable outcome 2
• JD keyword alignment

Role | Company | Years
• …

# Education & Certifications
• Degree/Course | Institution | Years | Certificates

# Languages
• English — level | Others — level

# Projects/Volunteering (optional)
• Project — 1–2 bullets with outcomes
`;

    // ---------- הנחיות למודל (User input) ----------
    const focus =
      target === "cv"
        ? isHeb
          ? "החזר בעיקר את השדה tailored_cv; מכתב מקדים אופציונלי בלבד."
          : "Return mainly tailored_cv; cover_letter can be minimal."
        : target === "cover"
        ? isHeb
          ? "החזר בעיקר את השדה cover_letter; קורות-חיים אופציונליים בלבד."
          : "Return mainly cover_letter; tailored_cv can be minimal."
        : isHeb
        ? "החזר גם cover_letter וגם tailored_cv."
        : "Return both cover_letter and tailored_cv.";

    const INPUT = [
      isHeb ? "מודעת דרושים:" : "Job description:",
      job_description,
      "",
      isHeb ? "קורות חיים מקוריים:" : "Original CV:",
      cv_text,
      "",
      isHeb
        ? "הוראות:\n- בצע השוואת ATS והחזר ציונים 0..100 בשדות המתאימים.\n- כתוב מכתב מקדים תמציתי (~180 מילים) מותאם למשרה.\n- בנה קורות-חיים לפי התבנית הבאה (שמור על הכותרות):"
        : "Instructions:\n- Perform ATS-style comparison and return 0..100 scores in the dedicated fields.\n- Write a concise cover letter (~180 words) tailored to this JD.\n- Build the resume exactly with the following template (keep headings):",
      CV_TEMPLATE,
      "",
      focus,
      "",
      isHeb
        ? "החזר JSON בלבד לפי הסכמה. אל תוסיף טקסט מחוץ ל-JSON."
        : "Return JSON only per the schema. No prose outside the JSON.",
    ].join("\n");

    // ---------- קריאה ל-Responses API ----------
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: {
          type: "json_schema",
          json_schema: { name: "AtsResult", strict: true, schema },
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

    // תחת response_format=json_schema נקבל JSON טהור בשדה output_text
    const text =
      data.output_text ??
      (Array.isArray(data.content)
        ? data.content.map((c) => c.text).join("\n")
        : "") ??
      "";

    // נרצה להחזיר אובייקט מוכן לקליינט (ולא רק מחרוזת)
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      // fallback בטוח במקרה קצה
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

    // אם המשתמש ביקש מיקוד – נרוקן את השדה הלא נדרש כדי שה-UI לא יתבלבל
    if (target === "cv") payload.cover_letter = "";
    if (target === "cover") payload.tailored_cv = "";

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(400).json({ error: e?.message || "OpenAI request failed" });
  }
}
