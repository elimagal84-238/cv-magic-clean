// lib/scoring/ranker.js
// Feature blend + gates + explainability.

import { bm25fScore, topKeywords, tok, normText } from "./bm25f.js";
import { coverage } from "./skills.js";
import weights from "./weights.v1_6.json" assert { type: "json" };

function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }
function pct(x){ return Math.round(clamp01(x)*100); }

function hardGates(jd, cv) {
  const tJD = normText(jd);
  const tCV = normText(cv);
  let cap = 1.0;
  const reasons = [];

  // Language gate
  if (/\b(english|אנגלית)\b.*\b(native|fluent|שליטה מלאה)\b/i.test(jd)) {
    const ok = /\b(english|אנגלית)\b.*\b(native|fluent|שוטפת|שליטה מלאה)\b/i.test(cv);
    if (!ok) { cap = Math.min(cap, 0.8); reasons.push("Missing fluent English"); }
  }

  // Location/Work permit (very soft)
  if (/\b(israel|tel aviv|hybrid|onsite|visa|work permit|ישראל|משרה מלאה במשרד)\b/.test(tJD)) {
    if (!/\b(israel|tel aviv|hybrid|onsite|ישראל|ת\"א|משרה מלאה|היברידי)\b/.test(tCV)) {
      cap = Math.min(cap, 0.9); reasons.push("Location/work setup unspecified");
    }
  }

  // Degree gate
  if (/\b(bachelor|degree|תואר)\b/.test(tJD) && !/\b(bachelor|b\.sc|ba|degree|תואר)\b/.test(tCV)) {
    cap = Math.min(cap, 0.85); reasons.push("Degree requirement not evidenced");
  }
  return { cap, reasons };
}

export function computeFeatures(jd, cv) {
  const bm = bm25fScore(cv, jd, { wMust: 2.0, wNice: 1.0, k1: 1.4, b: 0.75 });    // 0..1
  const { need, matched, missing, recall } = coverage(jd, cv);                      // 0..1
  const kws = topKeywords(jd, 30);
  const setCV = new Set(tok(cv));
  const kwMatch = kws.filter(k=>setCV.has(k));
  const keywordsRecall = kws.length ? kwMatch.length / kws.length : 0;

  // “Experience years” heuristic
  const yrs = (s) => { const m = normText(s).match(/(\d+)\s*(?:years?|שנ(?:ה|ים))/); return m?Number(m[1]):0; };
  const jdY = yrs(jd), cvY = yrs(cv);
  const exp = jdY ? Math.min(1, (cvY || 0) / jdY) : keywordsRecall;

  // Quality cues: numbers/% and action verbs
  const action = /\b(led|built|delivered|improved|reduced|optimized|designed|launched|increased|decreased|migrated|implemented|scaled)\b/i;
  const hasAction = action.test(cv);
  const nums = (cv.match(/\b\d+(\.\d+)?%?/g) || []).length;
  const quality = Math.max(0, Math.min(1, (hasAction?0.2:0) + Math.min(nums, 10) / 50)); // tiny bonus

  const gates = hardGates(jd, cv);

  return {
    bm25f: bm,
    skills_recall: recall,
    keywords_recall: keywordsRecall,
    experience: exp,
    quality,
    gate_cap: gates.cap,
    gate_reasons: gates.reasons,
    explain: {
      keywords_considered: kws.slice(0,20),
      keywords_matched: kwMatch.slice(0,20),
      skills_needed: [...need].slice(0,20),
      skills_missing: [...missing].slice(0,20)
    }
  };
}

export function rank(features, w = weights) {
  const s =
    clamp01(w.w_bm25f)         * clamp01(features.bm25f) +
    clamp01(w.w_skills)        * clamp01(features.skills_recall) +
    clamp01(w.w_keywords)      * clamp01(features.keywords_recall) +
    clamp01(w.w_experience)    * clamp01(features.experience) +
    clamp01(w.w_quality)       * clamp01(features.quality);

  const raw = Math.max(0, Math.min(1, s / (w.w_bm25f + w.w_skills + w.w_keywords + w.w_experience + w.w_quality)));
  const capped = Math.min(raw, features.gate_cap);
  return { raw, capped };
}

export function scoreAll(jd, cv) {
  const f = computeFeatures(jd, cv);
  const r = rank(f);
  return {
    match_score: pct(r.capped),
    keywords_match: pct(f.keywords_recall),
    requirements_match: pct(f.bm25f),       // proxy: section-weighted relevance
    experience_match: pct(f.experience),
    skills_match: pct(f.skills_recall),
    analysis: {
      gate_cap: Math.round(f.gate_cap*100),
      gate_reasons: f.gate_reasons,
      keywords: {
        considered: f.explain.keywords_considered,
        matched: f.explain.keywords_matched
      },
      skills: {
        needed: f.explain.skills_needed,
        missing: f.explain.skills_missing
      }
    }
  };
}
