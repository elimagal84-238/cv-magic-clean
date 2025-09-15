// pages/api/match.js
// CV-Magic Match API — v0.3 (single-file, no imports/FS/TS)
// POST { job_description: string, cv_text: string }
// Output: { scores:{match_score,keywords,skills,experience,requirements_coverage}, rationales:[...] }

const SKILLS = [
  "javascript","typescript","react","node","express","nextjs","html","css","sass",
  "python","django","flask","pandas","numpy","scikit-learn",
  "java","spring","kotlin",
  "c#","dotnet",".net","asp.net",
  "sql","postgres","mysql","mongodb","redis",
  "aws","gcp","azure","docker","kubernetes","terraform",
  "git","ci","cd","jira","confluence",
  "analytics","ga4","seo","sem","content",
  "matlab","r","tableau","powerbi"
];

const WEIGHTS = { keywords: 0.20, skills: 0.30, experience: 0.20, requirements: 0.30 };
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/* -------------------- light extract -------------------- */
const WORD = /[A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF0-9+\-/#.]*/g;

function tokenize(t) {
  const m = (t || "")
    .toLowerCase()
    .replace(/[^A-Za-z0-9\u0590-\u05FF+\-/#.\s]/g, " ")
    .match(WORD);
  return m ? m : [];
}

function splitSentences(t) {
  // ללא lookbehind כדי למנוע בעיות קומפילציה
  return (t || "")
    .replace(/\r/g, "")
    .split(/[.!?]+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractBulletedRequirements(t) {
  const lines = (t || "").split(/\n/).map((l) => l.trim());
  return lines
    .filter((l) => /^(\*|\-|\•|\d+\.)\s+/u.test(l))
    .map((l) => l.replace(/^(\*|\-|\•|\d+\.)\s+/u, "").trim())
    .filter(Boolean);
}

function extractYears(t) {
  const hits = t.match(/\b(\d{1,2})\s*(?:yrs?|years?|שנים)\b/gi) || [];
  return hits.map((m) => parseInt(m, 10)).filter((n) => !isNaN(n));
}

function extractSkillsByTaxonomy(tokens) {
  const set = new Set(tokens);
  const out = [];
  for (const s of SKILLS) if (set.has(String(s).toLowerCase())) out.push(s);
  return Array.from(new Set(out));
}

function extractAll(jd, cv) {
  const jdTokens = tokenize(jd);
  const cvTokens = tokenize(cv);
  return {
    jd: {
      requirements: extractBulletedRequirements(jd),
      skills: extractSkillsByTaxonomy(jdTokens),
      years: extractYears(jd),
      tokens: jdTokens,
    },
    cv: {
      sentences: splitSentences(cv),
      skills: extractSkillsByTaxonomy(cvTokens),
      years: extractYears(cv),
      tokens: cvTokens,
    },
  };
}

/* -------------------- scoring -------------------- */
const uniq = (a) => Array.from(new Set(a));
function keywordOverlap(a, b) {
  const A = new Set(a);
  let hit = 0;
  for (const t of uniq(b)) if (A.has(t)) hit++;
  const denom = Math.max(1, uniq(a).length);
  return (hit / denom) * 100;
}
function skillsScore(jdSkills, cvSkills) {
  if (!jdSkills.length) return 0;
  const L = cvSkills.map((x) => String(x).toLowerCase());
  const hit = jdSkills.filter((s) => L.includes(String(s).toLowerCase())).length;
  return (hit / jdSkills.length) * 100;
}
function experienceScore(jdYears, cvYears) {
  const j = jdYears.length ? Math.max(...jdYears) : 0;
  const c = cvYears.length ? Math.max(...cvYears) : 0;
  if (!j && !c) return 50;
  if (!j) return 70;
  if (!c) return 30;
  const ratio = c / j;
  if (ratio >= 1.2) return 90;
  if (ratio >= 1.0) return 75;
  if (ratio >= 0.7) return 55;
  return 35;
}
function bestSentence(requirement, sentences) {
  const reqTokens = String(requirement).toLowerCase().split(/\s+/).filter(Boolean);
  let best = { idx: -1, score: 0, text: "" };
  sentences.forEach((s, i) => {
    const sTokens = s.toLowerCase().split(/\s+/);
    const A = new Set(reqTokens);
    let hit = 0;
    for (const t of uniq(sTokens)) if (A.has(t)) hit++;
    const denom = Math.max(1, reqTokens.length);
    const overlap = (hit / denom) * 100;
    if (overlap > best.score) best = { idx: i, score: overlap, text: s };
  });
  return best;
}

function scoreAll(data) {
  const { jd, cv } = data;

  const kw = keywordOverlap(jd.tokens, cv.tokens);
  const sk = skillsScore(jd.skills, cv.skills);
  const ex = experienceScore(jd.years, cv.years);

  const rationales = [];
  let covered = 0;

  if (jd.requirements.length) {
    for (const req of jd.requirements) {
      const ev = bestSentence(req, cv.sentences);
      const reqKw = ev.score;
      const reqSk = sk; // קירוב גלובלי לגרסה ראשונית
      const reqEx = ex;
      const agg = 0.5 * reqKw + 0.25 * reqSk + 0.25 * reqEx;

      let status = "missing";
      if (agg >= 70) { status = "met"; covered++; }
      else if (agg >= 40) status = "partial";

      rationales.push({
        requirement: req,
        status,
        evidence: ev.idx >= 0 ? ev.text : undefined,
        reason:
          status === "met"
            ? "נמצאה חפיפה טובה בין ניסוח הדרישה למשפטים בקו״ח."
            : status === "partial"
            ? "חפיפה חלקית; מומלץ לחדד מונחים/מספרים רלוונטיים."
            : "אין ראיה מספקת בקו״ח; הוסף ניסיון/כישור ספציפי.",
        subscores: {
          keywords: Math.round(reqKw),
          skills: Math.round(reqSk),
          experience: Math.round(reqEx),
        },
      });
    }
  }

  const reqCov = jd.requirements.length ? (covered / jd.requirements.length) * 100 : Math.max(40, kw - 10);
  const overall = clamp(
    Math.round(kw * WEIGHTS.keywords + sk * WEIGHTS.skills + ex * WEIGHTS.experience + reqCov * WEIGHTS.requirements)
  );

  return {
    scores: {
      match_score: overall,
      keywords: Math.round(clamp(kw)),
      skills: Math.round(clamp(sk)),
      experience: Math.round(clamp(ex)),
      requirements_coverage: Math.round(clamp(reqCov)),
    },
    rationales,
  };
}

/* -------------------- API handler -------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { job_description, cv_text } = req.body || {};
    if (!job_description || !cv_text) {
      return res.status(400).json({ error: "job_description and cv_text are required" });
    }
    const extracted = extractAll(String(job_description), String(cv_text));
    const result = scoreAll(extracted);
    return res.status(200).json({ ok: true, extracted, ...result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}
