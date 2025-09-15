// src/lib/score.ts
// Scoring + rationales (no external deps). v0.1
import weights from "./weights.json";
import type { Extracted } from "./extract";

type ScoreResult = {
  scores: {
    match_score: number;
    keywords: number;
    skills: number;
    experience: number;
    requirements_coverage: number;
  };
  rationales: Array<{
    requirement?: string;
    status: "met" | "partial" | "missing";
    evidence?: string;
    reason: string;
    subscores: { keywords: number; skills: number; experience: number };
  }>;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function uniq<T>(a: T[]) { return Array.from(new Set(a)); }

function keywordOverlap(a: string[], b: string[]) {
  const A = new Set(a);
  let hit = 0;
  for (const t of uniq(b)) if (A.has(t)) hit++;
  const denom = Math.max(1, uniq(a).length);
  return (hit / denom) * 100;
}

function sentenceEvidence(requirement: string, sentences: string[]): { idx: number; score: number; text: string } {
  const reqTokens = requirement.toLowerCase().split(/\s+/).filter(Boolean);
  let best = { idx: -1, score: 0, text: "" };
  sentences.forEach((s, i) => {
    const sTokens = s.toLowerCase().split(/\s+/);
    const overlap = keywordOverlap(reqTokens, sTokens);
    if (overlap > best.score) best = { idx: i, score: overlap, text: s };
  });
  return best;
}

function skillsScore(jdSkills: string[], cvSkills: string[]) {
  if (!jdSkills.length) return 0;
  const hit = jdSkills.filter((s) => cvSkills.map((x) => x.toLowerCase()).includes(s.toLowerCase())).length;
  return (hit / jdSkills.length) * 100;
}

function experienceScore(jdYears: number[], cvYears: number[]) {
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

export function scoreAll(data: Extracted): ScoreResult {
  const { jd, cv } = data;

  // Keywords
  const kw = keywordOverlap(jd.tokens, cv.tokens);

  // Skills
  const sk = skillsScore(jd.skills, cv.skills);

  // Experience
  const ex = experienceScore(jd.years, cv.years);

  // Requirements coverage + rationales
  const rationals: ScoreResult["rationales"] = [];
  let covered = 0;
  if (jd.requirements.length) {
    for (const req of jd.requirements) {
      const ev = sentenceEvidence(req, cv.sentences);
      const reqKw = ev.score; // proxy for keyword coverage per requirement
      const reqSk = sk; // approximate per-req skills with global skills (v0.1 simplification)
      const reqEx = ex; // approximate per-req exp with global exp
      const agg = 0.5 * reqKw + 0.25 * reqSk + 0.25 * reqEx;

      let status: "met" | "partial" | "missing" = "missing";
      if (agg >= 70) { status = "met"; covered++; }
      else if (agg >= 40) { status = "partial"; }

      rationals.push({
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

  // Overall match
  const w = weights as { keywords: number; skills: number; experience: number; requirements: number };
  const overall = clamp(
    Math.round(kw * w.keywords + sk * w.skills + ex * w.experience + reqCov * w.requirements)
  );

  return {
    scores: {
      match_score: overall,
      keywords: Math.round(clamp(kw)),
      skills: Math.round(clamp(sk)),
      experience: Math.round(clamp(ex)),
      requirements_coverage: Math.round(clamp(reqCov)),
    },
    rationales: rationals,
  };
}
