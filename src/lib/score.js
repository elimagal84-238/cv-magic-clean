// src/lib/score.js
// Scoring + rationales — v0.2 (pure ESM)
import fs from "fs";
import path from "path";

function loadJSON(fname, fallback) {
  try {
    const p = path.join(process.cwd(), "src", "lib", fname);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
const WEIGHTS = loadJSON("weights.json", {
  keywords: 0.2,
  skills: 0.3,
  experience: 0.2,
  requirements: 0.3,
});

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const uniq = (a) => Array.from(new Set(a));

function keywordOverlap(a, b) {
  const A = new Set(a);
  let hit = 0;
  for (const t of uniq(b)) if (A.has(t)) hit++;
  const denom = Math.max(1, uniq(a).length);
  return (hit / denom) * 100;
}
function sentenceEvidence(requirement, sentences) {
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
function skillsScore(jdSkills, cvSkills) {
  if (!jdSkills.length) return 0;
  const L = cvSkills.map((x) => x.toLowerCase());
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

export function scoreAll(data) {
  const { jd, cv } = data;

  const kw = keywordOverlap(jd.tokens, cv.tokens);
  const sk = skillsScore(jd.skills, cv.skills);
  const ex = experienceScore(jd.years, cv.years);

  const rationales = [];
  let covered = 0;
  if (jd.requirements.length) {
    for (const req of jd.requirements) {
      const ev = sentenceEvidence(req, cv.sentences);
      const reqKw = ev.score;
      const reqSk = sk; // v0.2 approximation
      const reqEx = ex;
      const agg = 0.5 * reqKw + 0.25 * reqSk + 0.25 * reqEx;

      let status = "missing";
      if (agg >= 70) { status = "met"; covered++; }
      else if (agg >= 40) { status = "partial"; }

      rationales.push({
        requirement: req,
        status,
        evidence: ev.idx >= 0 ? ev.text : undefined,
        reason:
          status === "met"
            ? "נמצאה חפיפה טובה בין ניסוח הדרישה למשפטים בקו״ח."
            : status === "partial"
            ? "נמצאה חפיפה חלקית; מומלץ לחדד מונחים/מספרים רלוונטיים."
            : "לא נמצאה ראיה מספקת בקו״ח; כדאי להוסיף ניסיון/כישור ספציפי.",
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
