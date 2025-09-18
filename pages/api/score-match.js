// pages/api/score-match.js
// Pure deterministic scoring for gauges (no LLM). Safe to call on every run.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const {
      job_description = "",
      cv_text = "",
    } = req.body || {};

    const jd = String(job_description || "").slice(0, 50_000);
    const cv = String(cv_text || "").slice(0, 50_000);

    // ---- tokenization (he/en), keep only letters/digits, drop very short words
    const tokenize = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const clamp100 = (x) => Math.max(0, Math.min(100, Math.round(Number(x || 0))));

    const jdTokens = new Set(tokenize(jd));
    const cvTokens = new Set(tokenize(cv));
    const overlap = [...jdTokens].filter((t) => cvTokens.has(t));
    const keywords_match = clamp100(jdTokens.size ? (overlap.length / jdTokens.size) * 100 : 0);

    // requirements: detect bullet lines (•, -, *) or lines under "requirements/דרישות"
    const reqLines = jd
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s && (/^[-*•]/.test(s) || /(^|\s)(דרישות|requirements?)\b/i.test(s)));

    const reqMatched = reqLines.filter((line) => {
      const keys = tokenize(line).slice(0, 6);
      return keys.some((w) => cvTokens.has(w));
    }).length;
    const requirements_match = clamp100(
      reqLines.length ? (reqMatched / reqLines.length) * 100 : keywords_match
    );

    // skills: simple hint dictionary (can be extended later)
    const HINT_SKILLS = [
      "excel","sql","python","javascript","node","react","typescript","docker","kubernetes",
      "communication","leadership","sales","marketing","crm","hubspot","figma","photoshop",
      "seo","sem","ppc","kpi","jira","agile","scrum","analysis","analytics",
      "אקסל","פייתון","שיווק","מכירות","ניהול","דאטא","תוכן","עיצוב","ביצועים","crm","פרויקטים"
    ];
    const jdSkills = HINT_SKILLS.filter((k) => jd.toLowerCase().includes(k));
    const skillsMatched = jdSkills.filter((k) => cv.toLowerCase().includes(k)).length;
    const skills_match = clamp100(jdSkills.length ? (skillsMatched / jdSkills.length) * 100 : keywords_match);

    // experience (years): number near שנה/שנים/years
    const years = (s) => {
      const m = String(s || "").toLowerCase().match(/(\d+)\s*(?:שנ(?:ה|ים)|years?)/);
      return m ? Number(m[1]) : 0;
    };
    const jdYears = years(jd);
    const cvYears = years(cv);
    const experience_match = clamp100(jdYears ? (cvYears / jdYears) * 100 : keywords_match);

    const match_score = clamp100((keywords_match + requirements_match + skills_match + experience_match) / 4);

    const parsed_jd = {
      lang: /[\u0590-\u05FF]/.test(jd) ? "he" : "en",
      requirements: reqLines.map((text) => ({ text, weight: 1 })),
      skills: jdSkills.map((name) => ({ name })),
    };

    return res.status(200).json({
      match_score,
      keywords_match,
      requirements_match,
      experience_match,
      skills_match,
      parsed_jd,
      model: "deterministic",
    });
  } catch (e) {
    console.error("score-match error:", e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
