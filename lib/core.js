// lib/core.js
export async function InvokeLLM({ model = "gpt-4.1-mini", temperature = 0.5, prompt }) {
  if (!prompt) throw new Error("Missing prompt");

  const res = await fetch("/api/openai-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature, prompt }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}) ${text}`);
  }
  // Expect { content: string }
  return await res.json();
}
