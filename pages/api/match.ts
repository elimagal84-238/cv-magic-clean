// pages/api/match.ts
// CV-Magic Match API — v0.1 (Extract → Score → Explain)
// POST { job_description: string, cv_text: string }
import type { NextApiRequest, NextApiResponse } from "next";
import { extractAll } from "../../src/lib/extract";
import { scoreAll } from "../../src/lib/score";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { job_description, cv_text } = req.body || {};
    if (!job_description || !cv_text) {
      return res.status(400).json({ error: "job_description and cv_text are required" });
    }

    const jd = String(job_description);
    const cv = String(cv_text);

    const extracted = extractAll(jd, cv);
    const result = scoreAll(extracted);

    return res.status(200).json({
      ok: true,
      inputs: { jdLen: jd.length, cvLen: cv.length },
      extracted,
      ...result,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}
