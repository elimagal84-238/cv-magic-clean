// pages/api/openai-match.js
// Generates ATS scores + Cover Letter + Tailored CV with a strict template.

export const config = {
  runtime: "edge",
};

function pickLang(jd, cv) {
  const text = `${jd || ""}\n${cv || ""}`;
  return /[\u0590-\u05FF]/.test(text) ? "he" : "en";
}

function sysPrompt(lang) {
  const he = lang === "he";
  return (
    (he
      ? "אתה עוזר ATS שמייצר מכתב מקדים וקורות-חיים מותאמים בקפדנות למודעת דרושים.\n"
      : "You are an ATS assistant that produces a cover letter and strictly ATS-friendly tailored resume.\n") +
    (he
      ? "עליך להחזיר JSON בלבד (ללא טקסט נוסף) עם השדות: match_score, keywords_match, requirements_match, experience_match, skills_match, cover_letter, tailored_cv.\n"
      : "Return JSON ONLY (no extra text) with fields: match_score, keywords_match, requirements_match, experience_match, skills_match, cover_letter, tailored_cv.\n") +
    (he
      ? "הקפד על מספרים בין 0 ל-100 לשדות הציון. הטקסטים בעברית תקנית.\n"
      : "Scores must be integers 0..100. Texts must be in proper English.\n") +
    (he
      ? "לקורות-החיים: שמור פורמט ATS-Ready — כותרות ברורות, bullets קצרים, הישגים מדידים (%/מספרים/טווחי שנים), התאמת מילות מפתח מדרישות המשרה, ללא גרפיקה.\n"
      : "For the resume: ATS-Ready format — clear headings, short bullets, measurable achievements (%, numbers, years), JD keywords blended, no graphics.\n")
  );
}

function cvTemplate(lang) {
  const he = lang === "he";
  if (he) {
    return `# פרטים אישיים
שם מלא: <השלם אם חסר מה-CV>
אימייל: <...> | טלפון: <...> | מיקום: <...> | קישורים: LinkedIn/GitHub (אם רלוונטי)

# תקציר מקצועי
• 2–4 שורות תמצית ממוקדת שמסבירה למה המועמד מתאים למשרה הספציפית.

# מיומנויות מפתח (ATS)
• מיומנות/טכנולוגיה/תחום — רמת שליטה / שנות ניסיון
• מיומנות…
• …

# ניסיון תעסוקתי
תפקיד | חברה | עיר/היברידי | שנים (YYYY–YYYY)
• הישג מדיד 1 (מספרים/אחוזים/מעטפת)
• הישג מדיד 2
• התאמה למילות מפתח מהמשרה: <מילים מרכזיות משולבות בטבעיות>

תפקיד | חברה | שנים
• …

# השכלה והכשרות
• תואר/קורס | מוסד | שנים | תעודות (אם יש)

# שפות
• עברית — שוטפת | אנגלית — רמה X | שפות נוספות

# פרויקטים/התנדבות (אופציונלי)
• שם פרויקט — 1–2 bullets המראים ערך ותוצאה
`;
  }
  // English template
  return `# Contact
Full Name: <fill if missing from CV>
Email: <...> | Phone: <...> | Location: <...> | Links: LinkedIn/GitHub

# Professional Summary
• 2–4 lines summarizing exact fit for this JD.

# Core Skills (ATS)
• Skill/Tool/Domain — level / years
• Skill…
• …

# Experience
Role | Company | City/Hybrid | Years (YYYY–YYYY)
• Measurable win 1 (%, numbers, scope)
• Measurable win 2
• JD keyword alignment: <natural keywords>

Role | Company | Years
• …

# Education & Certifications
• Degree/Course | Institution | Years | Certificates

# Languages
• English — Level | Other — Level

# Projects/Volunteering (optional)
• Project name — 1–2 bullets showing value/outcome
`;
}

function userPrompt({ job_description, cv_text, lang, target }) {
  const he = lang === "he";
  const focus =
    target === "cv"
      ? he
        ? "התמקד בעיקר ב־tailored_cv, מכתב מקדים אופציונלי."
        : "Focus on tailored_cv; cover letter optional."
      : target === "cover"
      ? he
        ? "התמקד בעיקר ב־cover_letter, קורות-חיים אופציונליים."
        : "Focus on cover_letter; tailored CV optional."
      : he
      ? "החזר גם וגם — cover_letter וגם tailored_cv."
      : "Return both cover_letter and tailored_cv.";
  const tpl = cvTemplate(lang);
  return (
    (he ? "מודעת דרושים:\n" : "Job description:\n") +
    job_description +
    "\n\n" +
    (he ? "קורות חיים מקוריים:\n" : "Original CV:\n") +
    cv_text +
    "\n\n" +
    (he
      ? "הוראות:\n" +
        "- בצע השוואת ATS והחזר ציונים 0..100.\n" +
        "- כתוב מכתב מקדים תמציתי (עד ~180 מילים) עם התאמה ישירה למשרה.\n" +
        "- בנה קורות-חיים לפי התבנית הבאה (חובה לשמור על מבנה הכותרות):\n"
      : "Instructions:\n" +
        "- Perform ATS-style matching and return scores 0..100.\n" +
        "- Write a concise cover letter (~180 words) tailored to this JD.\n" +
        "- Build a resume strictly following this template (keep headings):\n") +
    tpl +
    "\n" +
    focus +
    "\n" +
    (he
      ? "החזר JSON בלבד, ללא הסברים נוספים. שמות שדות בדיוק: match_score, keywords_match, requirements_match, experience_match, skills_match, cover_letter, tailored_cv."
      : "Return JSON only, no extra prose. Field names exactly: match_score, keywords_match, requirements_match, experience_match, skills_match, cover_letter, tailored_cv.")
  );
}

async function callOpenAI(apiKey, model, messages) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(txt);
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }
    const body = await req.json();
    const { job_description, cv_text, target = "all", model_pref } = body || {};
    const lang = pickLang(job_description, cv_text);

    const sys = sysPrompt(lang);
    const user = userPrompt({ job_description, cv_text, lang, target });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
    }

    const model =
      model_pref === "gemini" || model_pref === "claude"
        ? "gpt-4o-mini" // fallback if other providers chosen on UI
        : "gpt-4o-mini";

    const data = await callOpenAI(apiKey, model, [
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);

    // normalize & respect target
    const out = {
      match_score: Math.max(0, Math.min(100, Math.round(Number(data.match_score || data.match || 0)))),
      keywords_match: Math.max(0, Math.min(100, Math.round(Number(data.keywords_match || data.keywords || 0)))),
      requirements_match: Math.max(0, Math.min(100, Math.round(Number(data.requirements_match || data.requirements || 0)))),
      experience_match: Math.max(0, Math.min(100, Math.round(Number(data.experience_match || data.experience || 0)))),
      skills_match: Math.max(0, Math.min(100, Math.round(Number(data.skills_match || data.skills || 0)))),
      cover_letter: String(data.cover_letter || ""),
      tailored_cv: String(data.tailored_cv || ""),
    };

    if (target === "cv") out.cover_letter = ""; // return just CV
    if (target === "cover") out.tailored_cv = ""; // return just Cover

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "error" }), { status: 500 });
  }
}
