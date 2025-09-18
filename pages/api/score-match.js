// pages/api/score-match.js
// דטרמיניסטי: מילות מפתח/דרישות/מיומנויות/וותק — נשמר פלט שמות שדות זהה ל-UI.

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const { job_description = "", cv_text = "" } = req.body || {};
    const jd = String(job_description || "").slice(0, 50_000);
    const cv = String(cv_text || "").slice(0, 50_000);

    const clamp100 = (x) => Math.max(0, Math.min(100, Math.round(Number(x || 0))));
    const norm = (s) => String(s || "").toLowerCase();
    const tokenize = (s) =>
      norm(s).replace(/[^\p{L}\p{N}\s\+\.\-#]/gu, " ").split(/\s+/).filter(w => w.length > 2);

    const uniq = (a) => [...new Set(a)];
    const setOf = (a) => new Set(a);
    const intersect = (A, B) => [...A].filter(x => B.has(x));
    const minus = (A, B) => [...A].filter(x => !B.has(x));

    const jdToksArr = tokenize(jd), cvToksArr = tokenize(cv);
    const jdSet = setOf(jdToksArr), cvSet = setOf(cvToksArr);

    // Keywords (שכיחות בסיסית)
    const freq = Object.create(null);
    for (const w of jdToksArr) freq[w] = (freq[w] || 0) + 1;
    const topKeywords = new Set(Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([w])=>w).slice(0, 30));
    const kwMatched = intersect(topKeywords, cvSet);
    const kwMissing = minus(topKeywords, cvSet);
    const keywords_match = clamp100((kwMatched.length / Math.max(1, topKeywords.size)) * 100);

    // Requirements — קווים שמתחילים בתבליטים/דרישות
    const reqLines = jd.split(/\n+/)
      .map(s => s.trim())
      .filter(s => /^[-*•]/.test(s) || /(^|\s)(דרישות|requirements?)\b/i.test(s));
    let reqHit = 0;
    const reqExpl = [];
    for (const line of reqLines) {
      const keys = uniq(tokenize(line)).slice(0, 6);
      const has = keys.some(w => cvSet.has(w));
      if (has) reqHit++;
      reqExpl.push({ text: line.slice(0, 300), matched: !!has, probe: keys });
    }
    const requirements_match = clamp100((reqHit / Math.max(1, reqLines.length)) * 100);

    // Skills — רשימת רמזים קצרה (ניתן להרחיב לפי הצורך)
    const HINT_SKILLS = [
      "excel","sql","python","javascript","typescript","node","react","next","docker","kubernetes",
      "communication","leadership","sales","marketing","crm","hubspot","figma","photoshop","seo","sem","ppc","kpi",
      "jira","agile","scrum","analysis","analytics",
      "אקסל","פייתון","ג'אווהסקריפט","דאטה","מכירות","שיווק","ניהול","פרויקטים","ענן","דוקר","קוברנטיס"
    ];
    const jdSkills = HINT_SKILLS.filter(k => norm(jd).includes(k));
    const cvSkills = HINT_SKILLS.filter(k => norm(cv).includes(k));
    const skillSetJD = setOf(jdSkills), skillSetCV = setOf(cvSkills);
    const skillMatched = intersect(skillSetJD, skillSetCV);
    const skillMissing = minus(skillSetJD, skillSetCV);
    const skills_match = clamp100((skillMatched.length / Math.max(1, skillSetJD.size)) * 100);

    // Experience (years) — ניחוש עדין
    const years = (s) => {
      const m = norm(s).match(/(\d+)\s*(?:שנ(?:ה|ים)|years?)/);
      return m ? Number(m[1]) : 0;
    };
    const jdYears = years(jd), cvYears = years(cv);
    const experience_match = clamp100(jdYears ? (cvYears / jdYears) * 100 : keywords_match);

    // Overall
    const match_score = clamp100(
      0.35 * keywords_match + 0.30 * requirements_match + 0.20 * skills_match + 0.15 * experience_match
    );

    const analysis = {
      summary: [
        `Keywords: ${keywords_match}% (${kwMatched.length}/${Math.max(1, topKeywords.size)})`,
        `Requirements: ${requirements_match}% (${reqHit}/${Math.max(1, reqLines.length)})`,
        `Skills: ${skills_match}% (${skillMatched.length}/${Math.max(1, skillSetJD.size)})`,
        `Experience: ${experience_match}% (cv≈${cvYears}y vs jd≈${jdYears}y)`,
      ],
      keywords: { top_considered: [...topKeywords].slice(0, 20), matched: kwMatched.slice(0, 20), missing: kwMissing.slice(0, 20) },
      requirements: { total: reqLines.length, matched: reqHit, details: reqExpl.slice(0, 20) },
      skills: { jd: jdSkills.slice(0, 20), cv: cvSkills.slice(0, 20), matched: skillMatched.slice(0, 20), missing: skillMissing.slice(0, 20) },
      experience: { jd_years: jdYears || 0, cv_years: cvYears || 0 },
    };

    // נשמר בדיוק שמות השדות שה-UI ממזג עם תוצאות ה-LLM
    return res.status(200).json({
      match_score,
      keywords_match,
      requirements_match,
      experience_match,
      skills_match,
      analysis,
      model: "deterministic",
    });
  } catch (e) {
    console.error("score-match error:", e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
