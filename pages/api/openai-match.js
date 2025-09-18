// pages/api/openai-match.js
// Node Next.js API Route — real scoring + LLM fallback/merge

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // ---------- input ----------
    const {
      job_description,
      cv_text,
      role_preset,       // { min, max, step }
      slider,            // 1..9
      run_index,
      temperature,       // optional from client
      model_pref,        // "chatgpt"|"gemini"|"claude" (נשתמש ב-OpenAI בפועל)
      target,            // "all"|"cover"|"cv"
    } = req.body || {};

    // ---------- sanitize ----------
    const jd = String(job_description || "").slice(0, 50_000);
    const cv = String(cv_text || "").slice(0, 50_000);
    const runIndex = Number(run_index || 0) || 0;
    const model = String(model_pref || "chatgpt");

    // temperature נגזר מה־slider ומה־preset (וממוזג עם מה שמגיע מהלקוח)
    const s = clampInt(Number(slider || 5), 1, 9);
    const preset = normalizeRolePreset(role_preset);
    const tFromSlider =
      preset.min + ((preset.max - preset.min) * (s - 1 + (runIndex % 3) * 0.15)) / 8;
    const temp = clamp01(0.5 * tFromSlider + 0.5 * clamp01(Number(temperature ?? tFromSlider)));

    // ---------- REAL SCORES (heuristics) ----------
    // טוקניזציה דו־לשונית בסיסית, סינון תווים לא-אות/ספרה
    const tokenize = (str) =>
      String(str || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const jdTokens = new Set(tokenize(jd));
    const cvTokens = new Set(tokenize(cv));
    const overlap = [...jdTokens].filter((t) => cvTokens.has(t));
    const keywords_h = pct(jdTokens.size ? overlap.length / jdTokens.size : 0);

    // דרישות: מזהה בולטים/כותרות "דרישות"/"requirements" ובודק התאמה לפי מילות מפתח עיקריות
    const reqLines = jd
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s && (/^[-*•]/.test(s) || /(^|\s)(דרישות|requirements?)\b/i.test(s)));

    const reqMatched = reqLines.filter((line) => {
      const keys = tokenize(line).slice(0, 6);
      return keys.some((w) => cvTokens.has(w));
    }).length;

    const requirements_h = pct(reqLines.length ? reqMatched / reqLines.length : keywords_h / 100);

    // skills: רמזים שכיחים (אפשר להחליף/להרחיב בהמשך)
    const HINT_SKILLS = [
      "excel","sql","python","javascript","node","react","typescript","docker","kubernetes",
      "communication","leadership","sales","marketing","crm","hubspot","figma","photoshop",
      "seo","sem","ppc","kpi","jira","agile","scrum","analysis","analytics",
      "אקסל","פייתון","שיווק","מכירות","ניהול","דאטא","תוכן","עיצוב","ביצועים","crm","פרויקטים"
    ];
    const jdSkills = HINT_SKILLS.filter((k) => jd.toLowerCase().includes(k));
    const skillsMatched = jdSkills.filter((k) => cv.toLowerCase().includes(k)).length;
    const skills_h = pct(jdSkills.length ? skillsMatched / jdSkills.length : keywords_h / 100);

    // ניסיון (שנות ניסיון): חיפוש מספר ליד "שנה/years"
    const years = (s) => {
      const m = String(s || "").toLowerCase().match(/(\d+)\s*(?:שנ(?:ה|ים)|years?)/);
      return m ? Number(m[1]) : 0;
    };
    const jdYears = years(jd);
    const cvYears = years(cv);
    const experience_h = pct(jdYears ? cvYears / jdYears : keywords_h / 100);

    const match_h = clamp100((keywords_h + requirements_h + skills_h + experience_h) / 4);

    // נכלול גם פירוק JD מינימלי שימושי לצד לקוח
    const parsed_jd = {
      lang: /[\u0590-\u05FF]/.test(jd) ? "he" : "en",
      requirements: reqLines.map((text) => ({ text, weight: 1 })),
      skills: jdSkills.map((name) => ({ name })),
    };

    // ---------- LLM call (optional/merge) ----------
    // נגדיר סכימה ברורה, נאפשר למודל להחזיר ניקוד + טקסטים
    const schema = `
{
  "type": "object",
  "properties": {
    "match_score": { "type": "number", "minimum": 0, "maximum": 100 },
    "keywords": { "type": "number", "minimum": 0, "maximum": 100 },
    "requirements_coverage": { "type": "number", "minimum": 0, "maximum": 100 },
    "experience": { "type": "number", "minimum": 0, "maximum": 100 },
    "skills": { "type": "number", "minimum": 0, "maximum": 100 },
    "tailored_cv": { "type": "string" },
    "cover_letter": { "type": "string" }
  },
  "required": ["match_score","keywords","requirements_coverage","experience","skills","tailored_cv","cover_letter"],
  "additionalProperties": false
}`.trim();

    const sysPrompt = `
You are CV-Magic, an ATS-aware assistant.
Return ONLY JSON that strictly matches the provided schema.
Scoring rules:
- match_score is 0..100 and reflects overall fit.
- keywords / requirements_coverage / experience / skills are each 0..100.
Be strict: do not exceed bounds; integers or decimals are fine.
Produce concise but complete "tailored_cv" (bullets allowed) and "cover_letter" (short, targeted).
Mirror important terminology from the JD while staying truthful to the CV.`.trim();

    const userPrompt = `
[JOB DESCRIPTION]
${jd}

[CV]
${cv}

[SLIDERS]
temperature=${temp.toFixed(2)} ; preset=${JSON.stringify(preset)}
target=${String(target || "all")}

[SCHEMA]
${schema}

Return ONLY minified JSON that conforms to the schema above.`.trim();

    // ננסה לקרוא ל-OpenAI; אם נכשל—נישאר עם ההיוריסטיקה
    let llm = null;
    try {
      llm = await callOpenAI(sysPrompt, userPrompt, temp);
      llm = safeParse(llm);
    } catch {
      llm = null;
    }

    // ---------- merge scores ----------
    const llmScores = {
      match:        clamp100(llm?.match_score),
      keywords:     clamp100(llm?.keywords),
      requirements: clamp100(llm?.requirements_coverage),
      experience:   clamp100(llm?.experience),
      skills:       clamp100(llm?.skills),
    };

    const hasLLM =
      [llmScores.match, llmScores.keywords, llmScores.requirements, llmScores.experience, llmScores.skills]
        .some((n) => Number.isFinite(n) && n > 0);

    const heurScores = {
      match: match_h,
      keywords: keywords_h,
      requirements: requirements_h,
      experience: experience_h,
      skills: skills_h,
    };

    // 3 מצבים:
    // 1) יש LLM → נשתמש בממוצע משוקלל 70% LLM, 30% היוריסטיקה (מייצב תנודות)
    // 2) אין LLM אבל יש היוריסטיקה → נשתמש בהיוריסטיקה
    // 3) אין כלום (קצה) → אפסים
    const blend = (a, b) => clamp100(0.7 * a + 0.3 * b);
    const finalScores = hasLLM
      ? {
          match:        blend(llmScores.match,        heurScores.match),
          keywords:     blend(llmScores.keywords,     heurScores.keywords),
          requirements: blend(llmScores.requirements, heurScores.requirements),
          experience:   blend(llmScores.experience,   heurScores.experience),
          skills:       blend(llmScores.skills,       heurScores.skills),
        }
      : { ...heurScores };

    // טקסטים
    const cover_letter = String(llm?.cover_letter || defaultCover(jd, cv));
    const tailored_cv  = String(llm?.tailored_cv  || defaultTailored(jd, cv));

    // ---------- response ----------
    return res.status(200).json({
      match_score:        finalScores.match,
      keywords_match:     finalScores.keywords,
      requirements_match: finalScores.requirements,
      experience_match:   finalScores.experience,
      skills_match:       finalScores.skills,
      cover_letter,
      tailored_cv,
      parsed_jd,
      temperature: temp,
      model: model,
      run_index: runIndex,
      slider: s,
      role_preset: preset,
      target: String(target || "all"),
    });
  } catch (e) {
    console.error("openai-match error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

/* ===================== utils ===================== */
function clamp01(x)       { return Math.max(0, Math.min(1, Number(x || 0))); }
function clamp100(x)      { const n = Number(x); return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0))); }
function clampInt(x,a,b)  { return Math.max(a, Math.min(b, Math.round(Number(x)||0))); }
function pct(ratio)       { return clamp100((Number(ratio)||0) * 100); }

function normalizeRolePreset(rp) {
  const fallback = { min: 0.2, max: 0.8, step: 0.1 };
  if (!rp || typeof rp !== "object") return fallback;
  const min  = typeof rp.min  === "number" ? rp.min  : fallback.min;
  const max  = typeof rp.max  === "number" ? rp.max  : fallback.max;
  const step = typeof rp.step === "number" ? rp.step : fallback.step;
  return { min: clamp01(min), max: clamp01(max), step: clamp01(step) };
}

/* ---------- default text fallbacks ---------- */
function defaultCover(jd, cv) {
  return `[Cover Letter]
Thank you for considering my application. Based on your job description, I highlighted relevant experience and keywords, keeping the tone concise and targeted.
(Generated locally as a fallback; connect your LLM for richer output.)`;
}
function defaultTailored(jd, cv) {
  return `[Tailored CV]
- Summary: Focused on the core requirements and keywords in the job ad.
- Experience: Emphasized relevant projects and measurable impact.
- Skills: Mirrored terminology from the JD where truthful.
(Fallback draft; connect your LLM for a richer version.)`;
}

/* ---------- OpenAI call (ChatGPT) ---------- */
async function callOpenAI(system, user, temperature) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const messages = [
    { role: "system", content: system },
    { role: "user",   content: user  },
  ];

  const body = {
    model: "gpt-4o-mini",
    messages,
    temperature: clamp01(temperature),
    response_format: { type: "json_object" },
  };

  const json = await postJson("https://api.openai.com/v1/chat/completions", body, {
    Authorization: `Bearer ${apiKey}`,
  });

  return json;
}

async function postJson(url, body, headers = {}) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const j = await resp.json();
  // החזר טקסט התוכן כמו שהוא (כבר ביקשנו JSON_OBJECT)
  return j?.choices?.[0]?.message?.content || "{}";
}

function safeParse(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    // תיקון נאיבי: מצא סוגריים החיצוניים הראשונים/אחרונים
    const i = jsonStr.indexOf("{");
    const k = jsonStr.lastIndexOf("}");
    if (i >= 0 && k > i) {
      try { return JSON.parse(jsonStr.slice(i, k + 1)); } catch {}
    }
    // ברירת מחדל בטוחה
    return {
      match_score: 0,
      keywords: 0,
      requirements_coverage: 0,
      experience: 0,
      skills: 0,
      tailored_cv: "",
      cover_letter: "",
    };
  }
}
