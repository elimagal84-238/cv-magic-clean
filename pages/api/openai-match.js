// pages/api/openai-match.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const { job_description, cv_text, role_preset, slider, run_index, temperature, model_pref, target } = req.body || {};
    const jd = String(job_description || "").slice(0,50_000);
    const cv = String(cv_text || "").slice(0,50_000);
    const runIndex = Number(run_index||0)||0;
    const model = String(model_pref||"chatgpt");

    const clamp01=x=>Math.max(0,Math.min(1,Number(x||0)));
    const clamp100=x=>{const n=Number(x);return Math.max(0,Math.min(100,Math.round(Number.isFinite(n)?n:0)));};
    const clampInt=(x,a,b)=>Math.max(a,Math.min(b,Math.round(Number(x)||0)));
    const normPreset=(rp)=>{const f={min:0.2,max:0.8,step:0.1}; if(!rp||typeof rp!=="object")return f;
      const min=typeof rp.min==="number"?rp.min:f.min, max=typeof rp.max==="number"?rp.max:f.max, step=typeof rp.step==="number"?rp.step:f.step;
      return {min:clamp01(min),max:clamp01(max),step:clamp01(step)};};

    const s = clampInt(Number(slider||5),1,9);
    const p = normPreset(role_preset);
    const tFromSlider = p.min + ((p.max-p.min)*(s-1 + (runIndex%3)*0.15))/8;
    const temp = clamp01(0.5*tFromSlider + 0.5*clamp01(Number(temperature ?? tFromSlider)));

    const schema = `
{
  "type":"object",
  "properties":{
    "match_score":{"type":"number","minimum":0,"maximum":100},
    "keywords":{"type":"number","minimum":0,"maximum":100},
    "requirements_coverage":{"type":"number","minimum":0,"maximum":100},
    "experience":{"type":"number","minimum":0,"maximum":100},
    "skills":{"type":"number","minimum":0,"maximum":100},
    "tailored_cv":{"type":"string"},
    "cover_letter":{"type":"string"}
  },
  "required":["match_score","keywords","requirements_coverage","experience","skills","tailored_cv","cover_letter"],
  "additionalProperties":false
}`.trim();

    const system = `
You are CV-Magic, an ATS-aware assistant. Return ONLY minified JSON per schema.
Scores must be 0..100. Keep cover_letter concise; tailored_cv can use short bullets.
Mirror JD terminology but stay truthful to the CV.`.trim();

    const user = `
[JOB DESCRIPTION]
${jd}

[CV]
${cv}

[SLIDERS]
temperature=${temp.toFixed(2)} ; preset=${JSON.stringify(p)}
target=${String(target||"all")}

[SCHEMA]
${schema}

Return ONLY minified JSON conforming to the schema above.`.trim();

    const content = await callOpenAI(system, user, temp);
    const obj = safeParse(content);

    return res.status(200).json({
      match_score:        clamp100(obj.match_score),
      keywords_match:     clamp100(obj.keywords),
      requirements_match: clamp100(obj.requirements_coverage),
      experience_match:   clamp100(obj.experience),
      skills_match:       clamp100(obj.skills),
      tailored_cv:        String(obj.tailored_cv||""),
      cover_letter:       String(obj.cover_letter||""),
      temperature:        temp,
      model,
      run_index:          runIndex,
      slider:             s,
      role_preset:        p,
      target:             String(target||"all"),
    });
  } catch (e) {
    console.error("openai-match error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

async function callOpenAI(system, user, temperature){
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const body = {
    model: "gpt-4o-mini",
    messages: [{role:"system",content:system},{role:"user",content:user}],
    temperature: Math.max(0,Math.min(1,Number(temperature||0.5))),
    response_format: { type: "json_object" },
  };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "content-type":"application/json", Authorization:`Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if(!resp.ok){ const t=await resp.text(); throw new Error(`OpenAI error ${resp.status}: ${t}`); }
  const j = await resp.json();
  return j?.choices?.[0]?.message?.content || "{}";
}
function safeParse(s){ try{return JSON.parse(s);}catch{
  const i=s.indexOf("{"), k=s.lastIndexOf("}"); if(i>=0&&k>i){ try{return JSON.parse(s.slice(i,k+1));}catch{} }
  return { match_score:0, keywords:0, requirements_coverage:0, experience:0, skills:0, tailored_cv:"", cover_letter:"" };
}}
