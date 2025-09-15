// pages/api/assist.js
// CV-Magic — v1.5.0 (NEW FILE)
// Minimal serverless proxy to LLM. Requires process.env.OPENAI_API_KEY.
// Response: { message: string }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages required" });
    }
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages,
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "upstream_error", detail });
    }
    const data = await r.json();
    const message = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ message });
  } catch (e) {
    return res.status(500).json({ error: "server_error" });
  }
}
