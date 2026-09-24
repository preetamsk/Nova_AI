import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are NOVA, an expert personal AI assistant created and built by Preetam SK. " +
  "If anyone asks who created you, who made you, who developed you, or who built you, always answer clearly, directly, and proudly that you were created and built by Preetam SK.\n\n" +
  "Always provide authoritative, well-structured, clear, professional, and technically accurate responses.\n\n" +
  "### Formatting & Presentation Standards:\n" +
  "- Never use raw HTML tags such as <br>, <p>, <table>, <tr>, <td>, or <div>. Instead, always use clean GitHub-flavored Markdown.\n" +
  "- When displaying tabular data, comparisons, or structured metrics, ALWAYS use standard Markdown table syntax with a header row, separator row (|---|---|), and row cells. Tables must always be formatted with standard Markdown syntax so they render cleanly.\n" +
  "- Use bold headers, clean bullet lists, and fenced code blocks with language tags.\n" +
  "- Never truncate or leave explanations unfinished; bring every thought to a complete, polished conclusion.\n\n" +
  "### Document & PDF Analysis Standards:\n" +
  "- Deliver an executive-level breakdown and comprehensive summary.\n" +
  "- Format responses using structured Markdown: **Executive Summary**, **Key Findings & Core Points**, **Data & Metrics** (using clean markdown tables where applicable), and **Actionable Conclusions / Next Steps**.\n" +
  "- Faithfully reference exact details, figures, and dates directly from the document.\n\n" +
  "### Visual & Image Analysis Standards:\n" +
  "- Provide a thorough, structured visual inspection.\n" +
  "- Detail the subject matter, primary visual elements, transcribed text or labels, composition, and context.\n" +
  "- Directly and thoughtfully answer the user's specific inquiries.\n\n" +
  "### General Quality Standards:\n" +
  "- Format all responses using clean GitHub-flavored markdown with bold headers, bullet lists, and fenced code blocks.\n" +
  "- Never truncate or leave explanations unfinished; bring every thought to a complete, polished conclusion.";

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

function isCreatorQuestion(raw: string): boolean {
  if (!raw) return false;
  const clean = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const patterns = [
    /\bwho (created|create|made|make|built|build|developed|develop|designed|design|coded|code|programmed|program|trained|train) (you|u|nova|this)\b/,
    /\b(how|who) (created|made|built|developed|designed) (you|u|nova)\b/,
    /\bwho (is|was) your (creator|maker|builder|developer|author|founder|owner|inventor|master|parent|father)\b/,
    /\bwho (are you|r u) (created|made|built|developed) by\b/,
    /\bwho (owns|invented|coded|programmed) (you|u|nova)\b/,
    /\bwho (founded|started) nova\b/,
    /\bwho made you\b/,
    /\bwho created you\b/,
    /\bwho built you\b/,
    /\bwho developed you\b/,
    /\bwho designed you\b/,
    /\bwho is preetam\b/,
    /\bwho is preetam sk\b/,
    /\btell me who (created|made|built|developed) you\b/,
  ];

  if (patterns.some((p) => p.test(clean))) {
    return true;
  }

  const hasWho = /\b(who|whom|how)\b/.test(clean);
  const hasVerb = /\b(created|create|built|build|made|make|developed|developer|creator|maker)\b/.test(clean);
  const hasTarget = /\b(you|u|nova)\b/.test(clean);

  return hasWho && hasVerb && hasTarget;
}

// In-memory cache for document text per conversation_id
declare global {
  var _novaDocCache: Map<string, { filename: string; text: string }> | undefined;
}
const docCache = globalThis._novaDocCache ?? (globalThis._novaDocCache = new Map<string, { filename: string; text: string }>());

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await req.json();
    const {
      conversation_id,
      message,
      messages: clientHistory,
      model: requestedModel,
      image,
      document,
      document_name,
      user_name,
    } = body;

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

    let userPromptText = (message || "").trim();
    const cleanUserName = typeof user_name === "string" ? user_name.trim() : "";

    function isGreetingOnly(text: string): boolean {
      const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
      return ["hi", "hello", "hey", "heya", "hola", "namaste", "goodmorning", "goodafternoon", "goodevening", "sup", "yo"].includes(clean);
    }

    // Deterministic personalized greeting when user says "hi", "hello", etc.
    if (!document && !image && cleanUserName && isGreetingOnly(userPromptText)) {
      const tokens = [
        "Hi", ` ${cleanUserName}`, "! ", "👋\n\n",
        "How", " can", " I", " help", " you", " today", "? ",
        "Whether", " you", " need", " assistance", " with", " coding", ",",
        " document", " analysis", ",", " or", " creative", " projects", ",",
        " I", "'m", " ready", " to", " assist", " you", "."
      ];
      const stream = new ReadableStream({
        async start(controller) {
          for (const token of tokens) {
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`)
            );
            await new Promise((r) => setTimeout(r, 20));
          }
          controller.enqueue(
            encoder.encode(`event: done\ndata: ${JSON.stringify({ model: config.display })}\n\n`)
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

    // Deterministic Creator Attribution Response (Preetam SK)
    if (!document && !image && isCreatorQuestion(userPromptText)) {
      const tokens = [
        "I", " was", " created", " by", " **", "Pre", "etam", " SK", "**", ".\n\n",
        "I", " am", " NOVA", ", an", " advanced", " personal", " AI", " assistant", " designed",
        " and", " built", " by", " **", "Pre", "etam", " SK", "**", " to", " help", " you",
        " with", " coding", ",", " document", " analysis", ",", " and", " complex", " problem", "-solving", "."
      ];
      const stream = new ReadableStream({
        async start(controller) {
          for (const token of tokens) {
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`)
            );
            await new Promise((r) => setTimeout(r, 20));
          }
          controller.enqueue(
            encoder.encode(`event: done\ndata: ${JSON.stringify({ model: config.display })}\n\n`)
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

    // Active Document Resolution: Check current document or cached conversation document
    let activeDocText = "";
    let activeDocName = document_name || "document.pdf";

    if (document) {
      activeDocText = await extractPdfText(document);
      if (conversation_id && activeDocText) {
        docCache.set(conversation_id, { filename: activeDocName, text: activeDocText });
      }
    } else if (conversation_id && docCache.has(conversation_id)) {
      const cached = docCache.get(conversation_id)!;
      activeDocText = cached.text;
      activeDocName = cached.filename;
    }

    if (activeDocText) {
      const truncated =
        activeDocText.length > 25000
          ? activeDocText.slice(0, 25000) + "\n\n...[Content truncated for length]..."
          : activeDocText;

      const isFirstUpload = Boolean(document);
      if (isFirstUpload) {
        const prefix = userPromptText
          ? `User Inquiry / Instructions: "${userPromptText}"\n\n`
          : "Please provide a comprehensive, executive-level summary and professional breakdown of this document.\n\n";
        userPromptText = `${prefix}📄 [Attached Document: "${activeDocName}"]:\n\`\`\`text\n${truncated}\n\`\`\`\n\nPlease deliver a detailed, professional, and well-structured response based on the document above.`;
      } else {
        // Follow-up question in the same chat about the already-uploaded PDF
        userPromptText = `📄 [Reference Document for this Chat: "${activeDocName}"]:\n\`\`\`text\n${truncated}\n\`\`\`\n\nUser Follow-up Inquiry: "${userPromptText}"\n\nPlease answer the user's inquiry thoroughly and accurately using the document text above.`;
      }
    } else if (document && !activeDocText) {
      userPromptText = `${userPromptText || "Please inspect this document"}\n\n[Attached Document: "${activeDocName}" (Note: Scanned or image-only PDF with no extractable text layer)]`;
    } else if (image) {
      const userInstruction = userPromptText
        ? `User Request: "${userPromptText}"\n\n`
        : "";
      userPromptText = `${userInstruction}Please provide a comprehensive, professional visual analysis of the attached image, detailing its primary subject, key components, any visible text or labels, and relevant context.`;
    }

    let activeSystemPrompt = SYSTEM_PROMPT;
    if (cleanUserName) {
      activeSystemPrompt +=
        `\n\n### User Identity & Personalization Guidelines:\n` +
        `- You are chatting with **${cleanUserName}**.\n` +
        `- When the user explicitly greets you (e.g. "hi", "hello", "hey", "good morning"), greet them warmly by their name (e.g. "Hi ${cleanUserName}!").\n` +
        `- CRITICAL: DO NOT start every normal reply or answer with "Hi ${cleanUserName}". For coding requests, questions, explanations, and follow-ups, dive straight into the answer without repetitive greeting prefixes.\n` +
        `- If the user asks who they are or what their name is, reply that their name is **${cleanUserName}**.\n` +
        `- Use their name naturally and occasionally when appropriate, never repetitively at the beginning of every response.`;
    }

    const messages: Array<{ role: string; content: any }> = [
      { role: "system", content: activeSystemPrompt },
    ];

    // Include recent conversation dialogue turns (up to 6 previous messages) for context
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      const recentHistory = clientHistory.slice(-6);
      for (const item of recentHistory) {
        if (item.role === "user" || item.role === "assistant") {
          // Keep content clean without re-injecting huge historical prompt strings
          const cleanText =
            typeof item.content === "string" ? item.content.slice(0, 2000).trim() : "";
          if (cleanText) {
            messages.push({ role: item.role, content: cleanText });
          }
        }
      }
    }

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
      max_tokens: image ? 800 : 2048,
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
