// pages/api/score-match.js
// Lightweight deterministic scorer: keywords, sections, skills taxonomy,
// cosine on term frequencies, and simple penalties.

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

import skillsTaxonomy from "../../src/lib/skills-taxonomy.json";

const STOP = new Set("a,an,the,of,and,or,to,in,on,for,with,by,at,as,from,into,over,under,about,across,is,are,was,were,be,been,being".split(","));
const NEG = new Set(["no experience","lack","none","not familiar","without"]);

function normText(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9\s\-\+\.#]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s) {
  return normText(s).split(" ").filter(t => t && !STOP.has(t));
}
function tfVec(arr) {
  const m = new Map();
  for (const t of arr) m.set(t, (m.get(t) || 0) + 1);
  return m;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) {
    if (b.has(k)) dot += v * b.get(k);
    na += v * v;
  }
  for (const v of b.values()) nb += v * v;
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function sectionSlice(cvText) {
  const t = normText(cvText);
  const sec = (label) => {
    const re = new RegExp(`\\b${label}\\b[:\\-\\s]*([\\s\\S]*?)(?=\\n\\s*(summary|skills|experience|work|projects|education|certifications)\\b|$)`, "i");
    const m = t.match(re);
    return m ? m[1] : "";
  };
  return {
    summary: sec("summary"),
    skills: sec("skills"),
    experience: sec("experience|work|projects"),
    education: sec("education"),
  };
}

function extractSkills(txt) {
  const t = normText(txt);
  const found = [];
  for (const s of skillsTaxonomy) {
    const k = s.toLowerCase();
    // allow symbols like c++, .net
    const re = new RegExp(`(^|\\W)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|\\W)`, "i");
    if (re.test(t)) found.push(s);
  }
  return new Set(found);
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { cvText = "", jdText = "" } = req.body || {};
    if (!cvText || !jdText) return res.status(400).json({ error: "Missing cvText or jdText" });

    const cvToks = tokens(cvText);
    const jdToks = tokens(jdText);

    const cvVec = tfVec(cvToks);
    const jdVec = tfVec(jdToks);

    // Base similarity
    const baseSim = cosine(cvVec, jdVec); // 0..1

    // Skills overlap
    const cvSkills = extractSkills(cvText);
    const jdSkills = extractSkills(jdText);
    const inter = new Set([...jdSkills].filter(x => cvSkills.has(x)));
    const skillsRecall = jdSkills.size ? inter.size / jdSkills.size : 0;

    // Section boosts: experience & skills alignment
    const cvSec = sectionSlice(cvText);
    const expCos = cosine(tfVec(tokens(cvSec.experience)), tfVec(jdVec));
    const skillCos = cosine(tfVec(tokens(cvSec.skills)), tfVec(tfVec(tokens([...jdSkills].join(" ")))));
    const eduCos = cosine(tfVec(tokens(cvSec.education)), jdVec);

    // Negative cues penalty
    const negHits = [...NEG].reduce((acc, phrase) => acc + (normText(cvText).includes(phrase) ? 1 : 0), 0);
    const penalty = Math.min(0.15, negHits * 0.05);

    // Weighted blend
    const wBase = 0.45, wSkills = 0.30, wExp = 0.18, wEdu = 0.07;
    let total = wBase * baseSim + wSkills * skillsRecall + wExp * expCos + wEdu * eduCos;
    total = Math.max(0, total - penalty);
    const toPct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100);

    const breakdown = {
      base_similarity: toPct(baseSim),
      skills_match: toPct(skillsRecall),
      experience_match: toPct(expCos),
      education_match: toPct(eduCos),
      penalty_negatives: Math.round(penalty * 100),
    };

    return res.status(200).json({
      ok: true,
      match_score: toPct(total),
      breakdown,
      details: {
        jd_skills_required: [...jdSkills],
        cv_skills_found: [...cvSkills],
        cv_skills_covered: [...inter],
      },
    });
  } catch (e) {
    console.error("score-match error", e);
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
