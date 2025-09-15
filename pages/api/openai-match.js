// pages/api/openai-match.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { model = "gpt-4.1-mini", temperature = 0.5, prompt } = req.body || {};
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        reasoning: { effort: "low" },
        input: prompt,
        max_output_tokens: 2048,
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI error" });

    // איסוף טקסט מהתגובה (תואם למודלים שונים)
    const text =
      data.output_text ??
      data.content?.map?.((c) => c.text).join("\n") ??
      data.output?.[0]?.content?.map?.((c) => c.text).join("\n") ??
      "";

    return res.status(200).json({ content: String(text || "") });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
