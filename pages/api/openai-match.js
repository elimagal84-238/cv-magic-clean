// pages/api/openai-match.js
// CV-Magic — API v0.4 (single-file, zero-deps)
// POST { job_description, cv_text } -> { scores, rationales }

const SKILLS = [
  "javascript","typescript","react","node","express","nextjs","html","css","sass",
  "python","django","flask","pandas","numpy","scikit-learn",
  "java","spring","kotlin","c#","dotnet",".net","asp.net",
  "sql","postgres","mysql","mongodb","redis",
  "aws","gcp","azure","docker","kubernetes","terraform",
  "git","ci","cd","jira","confluence",
  "analytics","ga4","seo","sem","content","matlab","r","tableau","powerbi"
];
const WEIGHTS = { keywords: 0.20, skills: 0.30, experience: 0.20, requirements: 0.30 };
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

// ---------- extract (ללא lookbehind/FS/Imports) ----------
const WORD = /[A-Za-z\u0590-\u05FF][A-Za-z\u0590-\u05FF0-9+\-/#.]*/g;
function tokenize(t){
  const m=(t||"").toLowerCase().replace(/[^A-Za-z0-9\u0590-\u05FF+\-/#.\s]/g," ").match(WORD);
  return m?m:[];
}
function splitSentences(t){
  return (t||"").replace(/\r/g,"").split(/[.!?]+|\n+/).map(s=>s.trim()).filter(Boolean);
}
function extractBulletedRequirements(t){
  return (t||"").split(/\n/).map(l=>l.trim())
    .filter(l=>/^(\*|\-|\•|\d+\.)\s+/u.test(l))
    .map(l=>l.replace(/^(\*|\-|\•|\d+\.)\s+/u,"").trim());
}
function extractYears(t){
  const hits=t.match(/\b(\d{1,2})\s*(?:yrs?|years?|שנים)\b/gi)||[];
  return hits.map(m=>parseInt(m,10)).filter(n=>!isNaN(n));
}
function extractSkills(tokens){
  const set=new Set(tokens);
  const out=[]; for(const s of SKILLS) if(set.has(String(s).toLowerCase())) out.push(s);
  return Array.from(new Set(out));
}
function extractAll(jd,cv){
  const jdTok=tokenize(jd), cvTok=tokenize(cv);
  return {
    jd:{ requirements:extractBulletedRequirements(jd), skills:extractSkills(jdTok), years:extractYears(jd), tokens:jdTok },
    cv:{ sentences:splitSentences(cv), skills:extractSkills(cvTok), years:extractYears(cv), tokens:cvTok }
  };
}

// ---------- score ----------
const uniq = a => Array.from(new Set(a));
function keywordOverlap(a,b){ const A=new Set(a); let hit=0; for(const t of uniq(b)) if(A.has(t)) hit++; const d=Math.max(1,uniq(a).length); return (hit/d)*100; }
function skillsScore(js,cs){ if(!js.length) return 0; const L=cs.map(x=>String(x).toLowerCase()); const hit=js.filter(s=>L.includes(String(s).toLowerCase())).length; return (hit/js.length)*100; }
function experienceScore(jd,cv){ const j=jd.length?Math.max(...jd):0, c=cv.length?Math.max(...cv):0;
  if(!j&&!c) return 50; if(!j) return 70; if(!c) return 30; const r=c/j;
  if(r>=1.2) return 90; if(r>=1.0) return 75; if(r>=0.7) return 55; return 35; }
function bestSentence(req, sentences){
  const reqT=String(req).toLowerCase().split(/\s+/).filter(Boolean);
  let best={idx:-1,score:0,text:""}; sentences.forEach((s,i)=>{ const sT=s.toLowerCase().split(/\s+/);
    const A=new Set(reqT); let hit=0; for(const t of uniq(sT)) if(A.has(t)) hit++; const d=Math.max(1,reqT.length);
    const overlap=(hit/d)*100; if(overlap>best.score) best={idx:i,score:overlap,text:s}; }); return best; }
function scoreAll(data){
  const { jd, cv }=data;
  const kw=keywordOverlap(jd.tokens, cv.tokens);
  const sk=skillsScore(jd.skills, cv.skills);
  const ex=experienceScore(jd.years, cv.years);
  const rationales=[]; let covered=0;
  if(jd.requirements.length){
    for(const req of jd.requirements){
      const ev=bestSentence(req, cv.sentences);
      const reqKw=ev.score, reqSk=sk, reqEx=ex;
      const agg=0.5*reqKw + 0.25*reqSk + 0.25*reqEx;
      let status="missing"; if(agg>=70){ status="met"; covered++; } else if(agg>=40){ status="partial"; }
      rationales.push({
        requirement:req, status, evidence:ev.idx>=0?ev.text:undefined,
        reason: status==="met" ? "נמצאה חפיפה טובה בין ניסוח הדרישה למשפטים בקו״ח."
             : status==="partial" ? "חפיפה חלקית; מומלץ לחדד מונחים/מספרים רלוונטיים."
             : "אין ראיה מספקת בקו״ח; הוסף ניסיון/כישור ספציפי.",
        subscores:{ keywords:Math.round(reqKw), skills:Math.round(reqSk), experience:Math.round(reqEx) }
      });
    }
  }
  const reqCov = jd.requirements.length ? (covered/jd.requirements.length)*100 : Math.max(40, kw-10);
  const overall = clamp(Math.round(kw*WEIGHTS.keywords + sk*WEIGHTS.skills + ex*WEIGHTS.experience + reqCov*WEIGHTS.requirements));
  return {
    scores:{ match_score:overall, keywords:Math.round(clamp(kw)), skills:Math.round(clamp(sk)),
             experience:Math.round(clamp(ex)), requirements_coverage:Math.round(clamp(reqCov)) },
    rationales
  };
}

// ---------- API ----------
export default async function handler(req,res){
  if(req.method!=="POST"){ res.setHeader("Allow","POST"); return res.status(405).json({error:"Method not allowed"}); }
  try{
    const { job_description, cv_text } = req.body || {};
    if(!job_description || !cv_text) return res.status(400).json({ error:"job_description and cv_text are required" });
    const extracted = extractAll(String(job_description), String(cv_text));
    const result = scoreAll(extracted);
    return res.status(200).json({ ok:true, extracted, ...result });
  }catch(e){ console.error(e); return res.status(500).json({ error:"server_error" }); }
}
