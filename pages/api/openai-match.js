// pages/api/openai-match.js
// Hybrid ATS: LLM + Hebrew/English heuristics with validation.
// Requires: process.env.OPENAI_API_KEY (or compatible endpoint).
export const config = { runtime: 'edge' };

const clamp = (n, a=0, b=100) => Math.max(a, Math.min(b, n));
const uniq = (a) => Array.from(new Set(a));
const interLen = (A,B) => { const s=new Set(B); let c=0; for (const x of new Set(A)) if (s.has(x)) c++; return c; };

function normalizeText(s){
  return String(s||'')
    .replace(/\r/g,'\n')
    .replace(/[\u0591-\u05C7]/g,'') // niqqud
    .replace(/[–—]/g,'-')
    .replace(/[“”„‟"״]/g,'"')
    .replace(/[’׳']/g,"'")
    .replace(/[·•▪◦●]/g,'•')
    .replace(/\u200f|\u200e/g,'') // RTL marks
    .toLowerCase();
}

const STOP_HE=new Set(['של','עם','על','גם','או','אם','כך','כדי','כי','אז','זו','זה','וה','ו','לא','בלי','הם','הן','הוא','היא','אני','אנחנו','אתם','אתן','את','אתה','אותו','אותה','אותם','אותן','כל','עוד','אך','אבל','מאוד','יותר','פחות','וכן','כמו','ללא','יש','אין','ב','ל','כ','מ','מה','כאשר','שהוא','שהיא','שלה','שלהם','שלו','שלכם','שלכן','הזה','הזו','האלה','אלה','זהו','זוהי','וכו','וכו׳']);
const STOP_EN=new Set(['the','a','an','to','of','in','on','at','for','and','or','but','is','are','be','as','by','with','this','that','these','those','from','it','its','your','their','our','my','me','we','you','i','was','were','been','will','can','could','should','would','about','over','under','per']);

function heLightStem(w){
  // תחיליות נפוצות
  w = w.replace(/^(?:ה|ו|ב|ל|מ|כ)/,'');
  // סיומות נפוצות
  w = w.replace(/(?:יים|ות|ים|ית|יות|ה|יו|יי|ך|ן)$/,'');
  return w;
}
function tokenize(s){
  const t=normalizeText(s);
  const raw=t.split(/[^0-9a-z\u0590-\u05FF]+/i).filter(Boolean);
  const out=[];
  for (let w of raw){
    if (STOP_HE.has(w) || STOP_EN.has(w)) continue;
    w = w.replace(/^['"]+|['"]+$/g,'');
    if (!w) continue;
    // סטמינג קל לעברית
    const isHe = /[\u0590-\u05FF]/.test(w);
    out.push(isHe ? heLightStem(w) : w);
  }
  return out;
}
function ngrams(tks,n){ const o=[]; for(let i=0;i<=tks.length-n;i++) o.push(tks.slice(i,i+n).join(' ')); return o; }
function splitRequirements(txt){
  const t=normalizeText(txt);
  const lines=t.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const bullets=lines.filter(x=>/^[•\-\*\d\.)]/.test(x));
  if (bullets.length>=2) return bullets;
  return t.split(/(?<=[\.\!\?]|[\n\r])/).map(x=>x.replace(/^[•\-\*\d\.)\s]+/,'').trim()).filter(x=>x.split(/\s+/).length>=3);
}
function extractYears(s){
  const t=normalizeText(s); const hits=[];
  t.replace(/(\d{1,2})\s*(?:שנים|שנה|שנת)/g,(_,n)=>{hits.push(+n);return _;});
  t.replace(/(\d{1,2})\s*(?:years?|yrs?)/g,(_,n)=>{hits.push(+n);return _;});
  return hits;
}

const STATIC_SKILLS=new Set([
  'excel','word','powerpoint','outlook','sql','crm','erp','sap','oracle','salesforce','tableau','powerbi',
  'jira','confluence','git','docker','kubernetes','python','javascript','react','node','java','.net','c#','ga4','seo','sem',
  'שירות','שירות לקוחות','ניהול','ניהול צוות','ניהול פרויקטים','תפעול','בקרה','דוחות','תקציב','הדרכה',
  'סדר וארגון','עמידה בלחץ','תקשורת בין אישית','משמרות','קבלת החלטות','נהלים','רכש','מלאי','מכירות',
  'front desk','housekeeping','pos','קבלה','אדמיניסטרציה','שיווק','עבודה בצוות','english','אנגלית','עברית','arabic','russian'
]);

function jaccard(aT,bT){ const A=uniq(aT),B=uniq(bT); if(!A.length||!B.length) return 0; const inter=interLen(A,B); const uni=uniq([...A,...B]).length; return clamp(inter/Math.max(1,uni)*100); }
function skillsScore(jdT,cvT){
  const jdSet=new Set(jdT), cvSet=new Set(cvT);
  const base=[...STATIC_SKILLS].filter(s=>s.split(' ').every(w=>jdSet.has(/[\u0590-\u05FF]/.test(w)?heLightStem(w):w)));
  const dyn=ngrams(jdT,2).concat(ngrams(jdT,3)).filter(p=>!/^\d/.test(p)).slice(0,200);
  const cand=uniq(base.concat(dyn));
  if (!cand.length) return 0;
  let hits=0;
  for(const c of cand){
    const parts=c.split(' ');
    const ok = parts.filter(w=>cvSet.has(/[\u0590-\u05FF]/.test(w)?heLightStem(w):w)).length/parts.length >= 0.8;
    if (ok) hits++;
  }
  return clamp(hits/cand.length*100);
}
function reqCoverage(jdText, cvT){
  const reqs=splitRequirements(jdText); if(!reqs.length) return 0;
  const cvSet=new Set(cvT); let covered=0;
  for(const r of reqs){
    const rTok=tokenize(r); if(!rTok.length) continue;
    const rSet=new Set(rTok);
    const inter = Array.from(rSet).filter(x=>cvSet.has(x)).length;
    const uni   = uniq([...rSet,...cvT]).length;
    const sim   = inter/Math.max(1,uni);
    if (sim >= 0.25) covered++;
  }
  return clamp(covered/reqs.length*100);
}
function expScore(jd,cv){
  const jy=extractYears(jd), cy=extractYears(cv);
  const j=jy.length?Math.max(...jy):0; const c=cy.length?Math.max(...cy):0;
  if(!j && !c) return 50; if(!j) return 70; if(!c) return 30;
  const r=c/j; if(r>=1.2) return 90; if(r>=1.0) return 75; if(r>=0.7) return 55; return 35;
}

const W={keywords:0.25, skills:0.30, requirements:0.25, experience:0.20};

// ---------- LLM helper ----------
async function callLLM(job_description, cv_text){
  const key = process.env.OPENAI_API_KEY;
  if(!key) return null;
  const sys = `You extract structured ATS metrics and NEVER invent facts. Return strict JSON matching this schema:
{
 "keywords_match": 0-100 integer,
 "skills_match": 0-100 integer,
 "requirements_match": 0-100 integer,
 "experience_match": 0-100 integer,
 "match_score": 0-100 integer,
 "strengths": string[],
 "gaps": string[]
}`;
  const user = `JOB DESCRIPTION:\n${job_description}\n\nCANDIDATE CV:\n${cv_text}\n\nReturn only JSON.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "content-type":"application/json", "authorization":`Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages:[{role:"system",content:sys},{role:"user",content:user}],
      temperature:0.2
    })
  });
  if(!resp.ok) return null;
  const data = await resp.json().catch(()=>null);
  const content = data?.choices?.[0]?.message?.content?.trim();
  if(!content) return null;
  try{
    const json = JSON.parse(content);
    // quick sanity
    ["keywords_match","skills_match","requirements_match","experience_match","match_score"]
      .forEach(k=>{ json[k]=clamp(+json[k]||0); });
    json.strengths = Array.isArray(json.strengths)? json.strengths.slice(0,6) : [];
    json.gaps = Array.isArray(json.gaps)? json.gaps.slice(0,6) : [];
    return json;
  }catch{ return null; }
}

// ---------- handler ----------
export default async function handler(req){
  if(req.method!=='POST')
    return new Response(JSON.stringify({error:'POST only'}),{status:405});

  const { job_description='', cv_text='' } = await req.json().catch(()=>({}));
  const jd = String(job_description||''), cv = String(cv_text||'');

  // Heuristic baseline (always)
  const jdT = tokenize(jd), cvT = tokenize(cv);
  const H = {
    keywords_match: Math.round(jaccard(jdT,cvT)),
    skills_match: Math.round(skillsScore(jdT,cvT)),
    requirements_match: Math.round(reqCoverage(jd,cvT)),
    experience_match: Math.round(expScore(jd,cv))
  };
  H.match_score = Math.round(
    H.keywords_match*W.keywords + H.skills_match*W.skills + H.requirements_match*W.requirements + H.experience_match*W.experience
  );
  H.strengths = [];
  H.gaps = [];
  if (H.skills_match>=40) H.strengths.push("Skills align with the role."); else H.gaps.push("Missing or weakly stated skills.");
  if (H.requirements_match>=50) H.strengths.push("Many job requirements are covered."); else H.gaps.push("Some job requirements are not addressed.");
  if (H.experience_match>=55) H.strengths.push("Experience seems adequate."); else H.gaps.push("Experience might be below expectation.");

  // Try LLM (best-of + validation)
  let L = null;
  try{ L = await callLLM(jd,cv); }catch{}

  if (!L){
    return new Response(JSON.stringify(H),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
  }

  // Blend (LLM 60%, Heuristic 40%), with clamps
  const blend = (k)=> Math.round(clamp(0.6*L[k] + 0.4*H[k]));
  const out = {
    keywords_match: blend('keywords_match'),
    skills_match: blend('skills_match'),
    requirements_match: blend('requirements_match'),
    experience_match: blend('experience_match'),
  };
  out.match_score = Math.round(clamp(0.6*L.match_score + 0.4*H.match_score));
  out.strengths = (L.strengths||H.strengths).slice(0,6);
  out.gaps = (L.gaps||H.gaps).slice(0,6);

  return new Response(JSON.stringify(out),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
}
