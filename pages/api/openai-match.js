// pages/api/openai-match.js
// Node Next.js API Route
//
// ────────────────────────────────────────────────────────────────────────────────
// חשוב: עדכן נתיבי ייבוא אם המבנה אצלך שונה.
// לדוגמה, אם שמרת את normalize ב־"lib/normalize.js", שנה את הנתיב בהתאם.
// ────────────────────────────────────────────────────────────────────────────────
import { normalizeCV, normalizeJD } from "@/src/utils/normalize";
import { atsScore } from "@/lib/ats-scoring";

import OpenAI from "openai";

// כלי עזר קטנים
const clamp01 = (x) => Math.max(0, Math.min(1, x ?? 0));
const rolePreset = (name = "General") => {
  // אפשר לכייל פה טמפרטורות/התנהגויות לפי פריסט
  // נשאיר ברירת מחדל פשוטה
  return { min: 0.4, max: 0.9, step: 0.1 };
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ====== קלט מהלקוח ======
    const {
      job_description,
      cv_text,
      role_preset,        // לדוגמה: "Copywriter" | "Surgeon" | "General"
      slider,             // 1..9 (מספר שלם מה־UI)
      run_index,          // לא חובה — לשונות קלה בחישוב טמפ'
      temperature,        // אם בא מהקליינט — נעדכן/נגשר מול השרת
      model_pref,         // "chatgpt" | "gemini" | "claude" (כאן נטפל ב-OpenAI)
      target,             // "all" | "cover" | "cv"
    } = req.body || {};

    // ====== ולידציה בסיסית ======
    if (!job_description || !cv_text) {
      return res.status(400).json({ error: "Missing job_description or cv_text" });
    }

    // ====== גזירת טמפרטורה מהסליידר/פריסט ======
    const runIndex = Number(run_index || 0);
    const rp = rolePreset(role_preset);
    const s = Math.max(rp.min, Math.min(9, Number(slider || 5)));
    const tFromSlider = rp.min + ((rp.max - rp.min) * (s - 1 + (runIndex % 3) * 0.15)) / 8;
    const temp = 0.5 * tFromSlider + 0.5 * clamp01(Number(temperature ?? tFromSlider));

    // ====== שלב 1: חילוץ לסכימה אחידה ======
    const parsedJD = normalizeJD(String(job_description).slice(0, 50_000));
    const parsedCV = normalizeCV(String(cv_text).slice(0, 50_000));

    // ====== שלב 2: ניקוד דטרמיניסטי ======
    const scorePack = atsScore({
      jd: parsedJD,
      cv: parsedCV,
      jobText: job_description,
      cvText: cv_text,
    });

    // נוחות/תאימות ל-UI קיים: גם שדות שטוחים 0..100
    const flatScores = {
      keywords: scorePack.keywords_match,
      requirements: scorePack.requirements_match,
      experience: scorePack.experience_match,
      skills: scorePack.skills_match,
      match: scorePack.match_score,
      evidence: scorePack.evidence || [],
    };

    // ====== שלב 3: יצירת תוצרים (אופציונלי) ======
    // אם אתה משתמש ב־/api/openai-chat ליצירה – אפשר להשאיר כאן "".
    // אחרת, הפונקציה למטה תייצר בעזרת OpenAI אם יש מפתח.
    const wantCover = !target || target === "all" || target === "cover";
    const wantCV    = !target || target === "all" || target === "cv";

    let cover_letter = "";
    let tailored_cv  = "";

    if (process.env.OPENAI_API_KEY && String(model_pref || "chatgpt").startsWith("chatgpt")) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      if (wantCover) {
        cover_letter = await generateCoverLetter(client, { job_description, cv_text, temp, scorePack });
      }
      if (wantCV) {
        tailored_cv = await generateTailoredCV(client, { job_description, cv_text, temp, scorePack });
      }
    }
    // אחרת — אם אין KEY או אתה משתמש בנתיב יצירה אחר — השאר "" וה-UI כבר יטפל.

    // ====== תשובה ללקוח ======
    return res.status(200).json({
      parsed_jd: parsedJD,
      parsed_cv: parsedCV,
      scores: flatScores,        // לתצוגת המדדים
      raw_scores: scorePack,     // אם תרצה להשתמש ב-frontend (evidence וכו')
      cover_letter,
      tailored_cv,
      meta: {
        role_preset: role_preset || "General",
        slider: Number(slider || 5),
        temperature: Number(temp.toFixed(2)),
        model: "ChatGPT (OpenAI)",
      },
    });
  } catch (err) {
    console.error("openai-match error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   יצירת תוצרים עם OpenAI (אופציונלי)
   אם כבר יש לך endpoint ייעודי ליצירה — אפשר למחוק את החלק הזה.
   שמרתי פרומפטים קצרים ותכל׳סים, עם כבוד למבנה/תאריכים מה-CV.
──────────────────────────────────────────────────────────────────────────── */

async function generateCoverLetter(client, { job_description, cv_text, temp, scorePack }) {
  const sys = `You are a helpful assistant that writes short, professional cover letters in the user's language.
Keep the tone concise and positive. Preserve user locale (HE/EN).`;
  const user = `
Job Description:
"""
${job_description}
"""

Candidate CV:
"""
${cv_text}
"""

Notes (ATS evidence):
${(scorePack.evidence || []).map((e, i) => `- ${e}`).join("\n")}

Write a 9–11 line cover letter tailored to the job, using the same language as the job description.
Do NOT invent dates. Do NOT change names.`;

  const rsp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: temp,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  return rsp.choices?.[0]?.message?.content?.trim() || "";
}

async function generateTailoredCV(client, { job_description, cv_text, temp, scorePack }) {
  const sys = `You are a CV editor. Keep structure, dates and chronology as in the original CV.
Rewrite bullets to match the job, but DO NOT fabricate employment or education.
Keep the user's language (HE/EN).`;
  const user = `
Target Job:
"""
${job_description}
"""

Original CV:
"""
${cv_text}
"""

Important alignment cues:
${(scorePack.evidence || []).map((e, i) => `- ${e}`).join("\n")}

Rewrite the CV content while preserving structure and dates. Keep it one page if possible.
Use clean bullets, short lines, and measurable outcomes where possible.`;

  const rsp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: temp,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  return rsp.choices?.[0]?.message?.content?.trim() || "";
}
