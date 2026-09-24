import { NextResponse } from "next/server";

export async function GET() {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (groqKey) {
    return NextResponse.json({
      models: [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.2-11b-vision-preview",
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
    models: ["NOVA Cloud AI (llama-3.3-70b-versatile)"],
  });
}
