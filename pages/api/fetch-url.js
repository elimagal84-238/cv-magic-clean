// pages/api/fetch-url.js
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { url } = req.body || {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "missing url" });

  try {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: `Fetch failed ${r.status}`, details: t.slice(0, 500) });
    }
    const ct = r.headers.get("content-type") || "";
    let text = "";
    if (ct.includes("application/json")) {
      const j = await r.json();
      text = typeof j === "string" ? j : JSON.stringify(j, null, 2);
    } else {
      text = await r.text();
    }
    if (/<html[\s\S]*>/i.test(text)) {
      const stripped = text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
      return res.status(200).json({ text: stripped });
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || "proxy error" });
  }
}
