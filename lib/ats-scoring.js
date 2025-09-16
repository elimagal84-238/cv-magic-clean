// lib/ats-scoring.js
export function atsScore({ jd, cv, jobText, cvText }) {
  // התאמות בסיסיות
  const skillNamesJD = new Set((jd.skills || []).map(s => s.name));
  const skillNamesCV = new Set((cv.skills || []).map(s => s.name));
  const skillsHit = [...skillNamesJD].filter(x => skillNamesCV.has(x)).length;
  const skillsTotal = Math.max(1, skillNamesJD.size);
  const skills_match = Math.round((skillsHit / skillsTotal) * 100);

  // דרישות (חובה/רגיל/יתרון)
  const reqs = jd.requirements || [];
  const weightsSum = reqs.reduce((a, r) => a + (r.weight || 2), 0) || 1;
  const hitSum = reqs.reduce((a, r) => {
    const txt = (r.text || "").toLowerCase();
    const hit = txt && (jobText + " " + cvText).toLowerCase().includes(txt.slice(0, Math.min(18, txt.length)));
    return a + (hit ? (r.weight || 2) : 0);
  }, 0);
  const requirements_match = Math.round((hitSum / weightsSum) * 100);

  // ניסיון: השוואת שנים (קירוב)
  const need = jd.years_total || 0;
  const have = cv.years_total || 0;
  const experience_match = Math.max(0, Math.min(100, Math.round((have / Math.max(1, need)) * 100)));

  // מילות מפתח: חפיפה פשוטה
  const kwJD = extractKeywords(jobText);
  const kwCV = extractKeywords(cvText);
  const kwHit = kwJD.filter(k => kwCV.includes(k)).length;
  const keywords_match = Math.round((kwHit / Math.max(1, kwJD.length)) * 100);

  // ציון כולל (משקולות בסיסיות)
  const match_score = Math.round(
    0.30 * requirements_match +
    0.30 * skills_match +
    0.25 * experience_match +
    0.15 * keywords_match
  );

  // Evidence קצר
  const evidence = [];
  if (skillsHit) evidence.push(`זוהו ${skillsHit}/${skillsTotal} מיומנויות רלוונטיות.`);
  if (need)      evidence.push(`שנות ניסיון: יש ${have}, נדרש ${need}.`);
  if (kwHit)     evidence.push(`חפיפת מילות מפתח: ${kwHit}/${kwJD.length}.`);

  return {
    keywords_match,
    requirements_match,
    experience_match,
    skills_match,
    match_score,
    evidence,
  };
}

function extractKeywords(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z\u0590-\u05ff0-9\+\.#]+/g)
    .filter(w => w && w.length >= 3)
    .slice(0, 200);
}
