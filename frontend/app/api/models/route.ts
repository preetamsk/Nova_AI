import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` },
      });
      if (res.ok) {
        const json = await res.json();
        const chatModels = (json.data || [])
          .map((m: { id: string }) => m.id)
          .filter(
            (id: string) =>
              !id.includes("whisper") &&
              !id.includes("embed") &&
              !id.includes("tts") &&
              !id.includes("guard")
          );
        if (chatModels.length > 0) {
          return NextResponse.json({ models: chatModels });
        }
      }
    } catch {
      // Fallback below
    }

    return NextResponse.json({
      models: [
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "llama3-70b-8192",
        "llama3-8b-8192",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
      ],
    });
  }

  if (geminiKey) {
    return NextResponse.json({
      models: ["Google Gemini (gemini-2.0-flash)", "gemini-2.0-flash", "gemini-1.5-flash"],
    });
  }

  if (openRouterKey) {
    return NextResponse.json({
      models: ["OpenRouter (meta-llama/llama-3.3-70b-instruct:free)"],
    });
  }

  return NextResponse.json({
    models: ["NOVA Cloud AI (llama-3.1-8b-instant)"],
  });
}
