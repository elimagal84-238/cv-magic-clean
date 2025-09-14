// pages/api/openai-match.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { model = "gpt-4o-mini", temperature = 0.4, prompt } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing" });
    }
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(r.status).json({ error: errText || "Upstream error" });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
