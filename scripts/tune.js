// scripts/tune.js
// Random-search for weights against data/pairs.csv (cv_text,jd_text,label_0_100)
// Run: node scripts/tune.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scoreAll } from "../lib/scoring/ranker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCSV(p) {
  const raw = fs.readFileSync(p, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(",");
  const idx = Object.fromEntries(header.map((h,i)=>[h.trim(), i]));
  const rows = lines.map(l => {
    const parts = l.split(/,(.+)?/).length > 2 ? splitCSV(l) : l.split(",");
    return {
      cv_text: parts[idx.cv_text] || "",
      jd_text: parts[idx.jd_text] || "",
      label: Number(parts[idx.label_0_100] || 0)
    };
  });
  return rows;
}
function splitCSV(line){
  // naive CSV with quotes
  const out = []; let cur = ""; let q=false;
  for (let i=0;i<line.length;i++){
    const c=line[i];
    if (c==='\"'){ q=!q; continue; }
    if (c===',' && !q){ out.push(cur); cur=""; continue; }
    cur+=c;
  }
  out.push(cur);
  return out;
}
function spearman(y, yhat){
  const rank = arr => arr
    .map((v,i)=>({v,i}))
    .sort((a,b)=>a.v-b.v)
    .map((o,rank)=>({i:o.i, r:rank+1}))
    .sort((a,b)=>a.i-b.i).map(x=>x.r);
  const r1=rank(y), r2=rank(yhat);
  const n=y.length;
  let num=0, d2=0;
  for(let i=0;i<n;i++){ const d=r1[i]-r2[i]; d2+=d*d; }
  return 1 - (6*d2)/(n*(n*n-1));
}

function evaluate(rows, w){
  const y=[], yhat=[];
  for (const r of rows) {
    const s = scoreAll(r.jd_text, r.cv_text);
    const pred = s.match_score;
    y.push(r.label);
    yhat.push(pred);
  }
  const mae = y.reduce((a,v,i)=>a+Math.abs(v-yhat[i]),0)/y.length;
  const sp = spearman(y, yhat);
  return { mae, sp };
}

function writeWeights(w) {
  const p = path.join(__dirname, "../lib/scoring/weights.v1_6.json");
  fs.writeFileSync(p, JSON.stringify(w, null, 2));
}

function randW(){
  const w = {
    w_bm25f: 0.35 + Math.random()*0.15,
    w_skills: 0.25 + Math.random()*0.15,
    w_keywords: 0.10 + Math.random()*0.10,
    w_experience: 0.10 + Math.random()*0.10,
    w_quality: 0.02 + Math.random()*0.03
  };
  // L2-like normalization
  const sum = Object.values(w).reduce((a,b)=>a+b,0);
  for(const k of Object.keys(w)) w[k]=w[k]/sum;
  return w;
}

(async function main(){
  const dataPath = path.join(__dirname, "../data/pairs.csv");
  if (!fs.existsSync(dataPath)) {
    console.error("Missing data/pairs.csv (cv_text,jd_text,label_0_100)");
    process.exit(1);
  }
  const rows = readCSV(dataPath).filter(r=>r.cv_text && r.jd_text);
  let best = JSON.parse(fs.readFileSync(path.join(__dirname,"../lib/scoring/weights.v1_6.json"), "utf8"));
  let bestScore = Infinity;
  let bestSp = -1;

  for (let i=0;i<200;i++){
    const cand = randW();
    const { mae, sp } = evaluate(rows, cand);
    // prefer lower MAE, break ties by higher Spearman
    const s = mae - sp*5; // tradeoff
    if (s < bestScore) {
      bestScore = s; bestSp = sp; best = cand;
      writeWeights(best);
      console.log(`Iter ${i}: MAE=${mae.toFixed(2)} Spearman=${sp.toFixed(3)}  -> UPDATED`);
    }
  }
  console.log("Best weights written to lib/scoring/weights.v1_6.json");
})();
