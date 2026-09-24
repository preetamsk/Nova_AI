import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are NOVA, an expert personal AI assistant. " +
  "Provide complete, well-structured, clear, and technically accurate responses. " +
  "Never stop, abbreviate, or truncate explanations, math formulas, or code midway. " +
  "When writing code, always provide full, working implementations within proper markdown code fences with the language specified. " +
  "Structure technical answers logically using clear headings, bullet points, or step-by-step instructions where appropriate, " +
  "and always bring your thoughts to a complete conclusion.";

async function extractPdfText(dataUrlOrBase64: string): Promise<string> {
  try {
    const base64 = dataUrlOrBase64.includes(",")
      ? dataUrlOrBase64.split(",")[1]
      : dataUrlOrBase64;
    const binary = Buffer.from(base64, "base64");
    const { extractText } = await import("unpdf");
    const res = await extractText(new Uint8Array(binary));
    const pages = Array.isArray(res.text) ? res.text : [res.text];
    const joined = pages
      .filter(Boolean)
      .map((p: string) => p.trim())
      .join("\n\n")
      .trim();
    return joined;
  } catch (err: any) {
    console.error("PDF parse error:", err?.message || err);
    return "";
  }
}

function getProviderConfig(requestedModel?: string) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  if (groqKey) {
    let model = "openai/gpt-oss-120b";
    if (requestedModel && requestedModel.trim()) {
      const clean = requestedModel.replace(/^Groq \((.*)\)$/, "$1").trim();
      if (clean && !clean.includes("NOVA") && clean !== "undefined") {
        model = clean;
      }
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
  const encoder = new TextEncoder();

  try {
    const body = await req.json();
    const { message, model: requestedModel, image, document, document_name } = body;

    const config = getProviderConfig(requestedModel);

    if (!config) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message: "Cloud AI API key is not configured. Please add GROQ_API_KEY in Vercel environment variables.",
              })}\n\n`
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

    // Process PDF document if attached
    let userPromptText = (message || "").trim();
    if (document) {
      const extractedText = await extractPdfText(document);
      const filename = document_name || "document.pdf";
      if (extractedText) {
        const truncated =
          extractedText.length > 25000
            ? extractedText.slice(0, 25000) + "\n\n...[Content truncated for length]..."
            : extractedText;
        const prefix = userPromptText
          ? `${userPromptText}\n\n`
          : "Please carefully analyze and summarize this attached document:\n\n";
        userPromptText = `${prefix}📄 [Attached PDF: ${filename}]\n\`\`\`text\n${truncated}\n\`\`\`\n[End of Document]`;
      } else {
        userPromptText = `${userPromptText || "Please inspect this document"}\n\n[Attached Document: ${filename} (Scanned or image-only PDF with no extractable text layer)]`;
      }
    } else if (!userPromptText && image) {
      userPromptText = "Please describe and analyse this image in detail.";
    }

    const messages: Array<{ role: string; content: any }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPromptText || "Please analyse this image." },
          { type: "image_url", image_url: { url: image } },
        ],
      });
    } else {
      messages.push({ role: "user", content: userPromptText });
    }

    // Vision model selection: on Groq, use qwen/qwen3.8-27b for image inputs
    const selectedModel = image && config.provider === "Groq" ? "qwen/qwen3.8-27b" : config.model;

    const payload = {
      model: selectedModel,
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
      let errMsg = `Cloud AI service error (${upstreamResponse.status})`;
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed?.error?.message || errMsg;
      } catch {
        errMsg = `${errMsg}: ${errText.slice(0, 160)}`;
      }
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: errMsg })}\n\n`)
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
                  encoder.encode(`event: done\ndata: ${JSON.stringify({ model: config.display })}\n\n`)
                );
                continue;
              }

              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed?.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`event: token\ndata: ${JSON.stringify({ text: delta })}\n\n`)
                  );
                }
              } catch {
                // Ignore partial JSON chunks
              }
            }
          }

          if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") {
                controller.enqueue(
                  encoder.encode(`event: done\ndata: ${JSON.stringify({ model: config.display })}\n\n`)
                );
              }
            }
          }
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message: "Stream interrupted: " + (err?.message || "connection error"),
              })}\n\n`
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
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message: "Internal error: " + (error?.message || "server error"),
            })}\n\n`
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
}
