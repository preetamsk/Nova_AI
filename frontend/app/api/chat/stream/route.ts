import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are NOVA, an expert personal AI assistant. " +
  "Provide complete, well-structured, clear, and technically accurate responses. " +
  "Never stop, abbreviate, or truncate explanations, math formulas, or code midway. " +
  "When writing code, always provide full, working implementations within proper markdown code fences with the language specified. " +
  "Structure technical answers logically using clear headings, bullet points, or step-by-step instructions where appropriate, " +
  "and always bring your thoughts to a complete conclusion.";

function getProviderConfig(requestedModel?: string) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  if (groqKey) {
    let model = "llama-3.3-70b-versatile";
    if (requestedModel) {
      if (requestedModel.includes("llama-3.1-8b")) model = "llama-3.1-8b-instant";
      else if (requestedModel.includes("llama-3.2-11b")) model = "llama-3.2-11b-vision-preview";
      else if (requestedModel.includes("llama-3.3")) model = "llama-3.3-70b-versatile";
      else if (requestedModel.includes("mixtral")) model = "mixtral-8x7b-32768";
      else if (requestedModel.includes("gemma")) model = "gemma2-9b-it";
    }
    return {
      provider: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groqKey,
      model,
      display: `Groq (${model})`,
    };
  }

  if (geminiKey) {
    const model = requestedModel && requestedModel.includes("gemini") ? requestedModel : "gemini-2.0-flash";
    return {
      provider: "Google Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: geminiKey,
      model,
      display: `Google Gemini (${model})`,
    };
  }

  if (openRouterKey) {
    const model = requestedModel || "meta-llama/llama-3.3-70b-instruct:free";
    return {
      provider: "OpenRouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: openRouterKey,
      model,
      display: `OpenRouter (${model})`,
    };
  }

  if (openAIKey) {
    const model = requestedModel || "gpt-4o-mini";
    return {
      provider: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      key: openAIKey,
      model,
      display: `OpenAI (${model})`,
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, model: requestedModel, image, document, document_name } = body;

    const config = getProviderConfig(requestedModel);

    // Prepare SSE stream response
    const encoder = new TextEncoder();

    if (!config) {
      // Missing API key error
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: {"message": "Cloud AI API key is not configured. Please add GROQ_API_KEY or GEMINI_API_KEY in Vercel environment variables."}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Format messages for cloud LLM
    let userContent: any = message || (image ? "Please analyse this image." : "Please analyse this document.");
    if (document && document_name) {
      userContent = `${userContent}\n\n[Document attached: ${document_name}]`;
    }

    const messages: Array<{ role: string; content: any }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: typeof userContent === "string" ? userContent : "Please analyse this image." },
          { type: "image_url", image_url: { url: image } },
        ],
      });
    } else {
      messages.push({ role: "user", content: userContent });
    }

    const payload = {
      model: image && config.provider === "Groq" ? "llama-3.2-11b-vision-preview" : config.model,
      messages,
      stream: true,
      max_tokens: 2048,
      temperature: 0.4,
    };

    const upstreamResponse = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nova-ai.vercel.app",
        "X-Title": "NOVA AI",
      },
      body: JSON.stringify(payload),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errText = await upstreamResponse.text().catch(() => "Unknown upstream error");
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: {"message": "Cloud AI service error (${upstreamResponse.status}): ${errText.slice(0, 180)}"}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Transform upstream chunk stream to SSE
    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                controller.enqueue(
                  encoder.encode(`event: done\ndata: {"model": ${JSON.stringify(config.display)}}\n\n`)
                );
                continue;
              }

              try {
                const parsed = JSON.parse(dataStr);
                const delta =
                  parsed?.choices?.[0]?.delta?.content ??
                  parsed?.choices?.[0]?.delta?.reasoning ??
                  "";
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`event: token\ndata: {"text": ${JSON.stringify(delta)}}\n\n`)
                  );
                }
              } catch {
                // Ignore JSON parse errors on partial chunks
              }
            }
          }

          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                controller.enqueue(
                  encoder.encode(`event: done\ndata: {"model": ${JSON.stringify(config.display)}}\n\n`)
                );
              }
            }
          }
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: {"message": "Stream interrupted: ${err?.message || "connection error"}"}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: {"message": "Internal error: ${error?.message || "server error"}"}\n\n`)
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
