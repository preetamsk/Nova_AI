"""Unified Cloud AI and local fallback service for NOVA.

Supports free-tier OpenAI-compatible cloud providers:
- Groq (GROQ_API_KEY) — ultra-fast Llama 3.3 70B & Llama 3.2 Vision
- Google Gemini (GEMINI_API_KEY) — Gemini 2.0 Flash / 1.5 Flash
- OpenRouter (OPENROUTER_API_KEY) — free hosted models
- OpenAI (OPENAI_API_KEY)
- Local Ollama fallback when running on a development laptop
"""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx

from models import ChatMessage
from services.document_service import extract_pdf_content
from settings import get_settings


class NOVAServiceError(Exception):
    """User-safe exception for AI provider errors."""


NOVA_SYSTEM_PROMPT = (
    "You are NOVA, an expert personal AI assistant. "
    "Provide complete, well-structured, clear, and technically accurate responses. "
    "Never stop, abbreviate, or truncate explanations, math formulas, or code midway. "
    "When writing code, always provide full, working implementations within proper markdown code fences with the language specified. "
    "Structure technical answers logically using clear headings, bullet points, or step-by-step instructions where appropriate, "
    "and always bring your thoughts to a complete conclusion."
)


def _get_provider_config() -> dict[str, str]:
    settings = get_settings()

    # 1. Groq (Recommended: fast & free tier)
    if settings.groq_api_key or settings.ai_provider == "groq":
        return {
            "provider": "Groq",
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": settings.groq_api_key,
            "default_text_model": settings.ai_model or "llama-3.3-70b-versatile",
            "default_vision_model": settings.ai_vision_model or "llama-3.2-11b-vision-preview",
            "available_models": [
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "llama-3.2-11b-vision-preview",
            ],
        }

    # 2. Google Gemini (OpenAI-compatible endpoint)
    if settings.gemini_api_key or settings.ai_provider == "gemini":
        return {
            "provider": "Google Gemini",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
            "api_key": settings.gemini_api_key,
            "default_text_model": settings.ai_model or "gemini-2.0-flash",
            "default_vision_model": settings.ai_vision_model or "gemini-2.0-flash",
            "available_models": ["gemini-2.0-flash", "gemini-1.5-flash"],
        }

    # 3. OpenRouter (Free community models)
    if settings.openrouter_api_key or settings.ai_provider == "openrouter":
        return {
            "provider": "OpenRouter",
            "base_url": "https://openrouter.ai/api/v1",
            "api_key": settings.openrouter_api_key,
            "default_text_model": settings.ai_model or "meta-llama/llama-3.3-70b-instruct:free",
            "default_vision_model": settings.ai_vision_model or "google/gemini-2.0-flash-exp:free",
            "available_models": [
                "meta-llama/llama-3.3-70b-instruct:free",
                "google/gemini-2.0-flash-exp:free",
            ],
        }

    # 4. OpenAI
    if settings.openai_api_key or settings.ai_provider == "openai":
        return {
            "provider": "OpenAI",
            "base_url": settings.ai_base_url or "https://api.openai.com/v1",
            "api_key": settings.openai_api_key,
            "default_text_model": settings.ai_model or "gpt-4o-mini",
            "default_vision_model": settings.ai_vision_model or "gpt-4o-mini",
            "available_models": ["gpt-4o-mini", "gpt-4o"],
        }

    # 5. Custom OpenAI-compatible endpoint
    if settings.ai_base_url:
        return {
            "provider": "Custom",
            "base_url": settings.ai_base_url,
            "api_key": settings.openai_api_key or "custom",
            "default_text_model": settings.ai_model or "default",
            "default_vision_model": settings.ai_vision_model or "default",
            "available_models": [settings.ai_model or "default"],
        }

    # 6. Fallback: local Ollama
    return {
        "provider": "Local Ollama",
        "base_url": settings.ollama_base_url,
        "api_key": "",
        "default_text_model": settings.ollama_text_model,
        "default_vision_model": settings.ollama_vision_model,
        "available_models": [settings.ollama_text_model, settings.ollama_vision_model],
    }


def display_model_name() -> str:
    config = _get_provider_config()
    return f"{config['provider']} ({config['default_text_model']})"


def list_models() -> list[str]:
    config = _get_provider_config()
    return list(config.get("available_models", [config["default_text_model"]]))


def _format_messages(
    history: list[ChatMessage],
    image: str | None,
    document: str | None,
    document_name: str | None,
) -> list[dict[str, object]]:
    formatted: list[dict[str, object]] = [{"role": "system", "content": NOVA_SYSTEM_PROMPT}]

    recent = history[-16:]
    latest_index = len(recent) - 1

    for idx, item in enumerate(recent):
        role = item.role if item.role in {"user", "assistant"} else "user"
        content_text = item.content[-8_000:]

        # Attach image/PDF to the latest user message
        if idx == latest_index and role == "user":
            user_text = content_text
            if document:
                pdf = extract_pdf_content(document)
                user_text += f"\n\nAttached PDF ({document_name or 'document.pdf'}):\n{pdf.text}"

            if image:
                formatted.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text or "Please analyse this image."},
                        {"type": "image_url", "image_url": {"url": image}},
                    ],
                })
            else:
                formatted.append({"role": "user", "content": user_text})
        else:
            formatted.append({"role": role, "content": content_text})

    return formatted


def stream_response(
    history: list[ChatMessage],
    image: str | None = None,
    document: str | None = None,
    document_name: str | None = None,
    model_name: str | None = None,
) -> Iterator[str]:
    config = _get_provider_config()

    # Route to local Ollama if no cloud key is set and Ollama is selected
    if config["provider"] == "Local Ollama":
        if not config["base_url"]:
            raise NOVAServiceError(
                "NOVA cloud AI key is not configured. Please set your free GROQ_API_KEY "
                "(get one free at console.groq.com/keys) or GEMINI_API_KEY in environment variables."
            )
        from services.ollama_service import stream_response as ollama_stream
        yield from ollama_stream(history, image, document, document_name, model_name)
        return

    api_key = config.get("api_key")
    if not api_key:
        raise NOVAServiceError(
            f"API key for {config['provider']} is missing. Please set your "
            f"{'GROQ_API_KEY' if config['provider'] == 'Groq' else 'GEMINI_API_KEY'} in environment variables."
        )

    # Choose model
    has_image = bool(image)
    if has_image:
        selected_model = config["default_vision_model"]
    elif model_name and model_name in config.get("available_models", []):
        selected_model = model_name
    else:
        selected_model = config["default_text_model"]

    messages = _format_messages(history, image, document, document_name)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nova-ai.vercel.app",
        "X-Title": "NOVA AI",
    }
    payload = {
        "model": selected_model,
        "messages": messages,
        "stream": True,
        "max_tokens": 2048,
        "temperature": 0.4,
    }

    url = f"{config['base_url'].rstrip('/')}/chat/completions"

    try:
        with httpx.Client(timeout=httpx.Timeout(connect=10, read=120, write=30, pool=5)) as client:
            with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code == 401:
                    raise NOVAServiceError(
                        f"Authentication failed with {config['provider']}. Please verify your API key."
                    )
                if response.status_code == 429:
                    raise NOVAServiceError(
                        f"{config['provider']} rate limit reached. Please wait a minute and try again."
                    )
                if response.status_code >= 400:
                    detail = response.read().decode("utf-8", errors="ignore")
                    raise NOVAServiceError(
                        f"{config['provider']} API error ({response.status_code}): {detail[:200]}"
                    )

                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        raw_data = line[6:].strip()
                        if raw_data == "[DONE]":
                            return
                        try:
                            chunk = json.loads(raw_data)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield str(delta)
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
    except NOVAServiceError:
        raise
    except httpx.ConnectError as error:
        raise NOVAServiceError(
            f"NOVA cannot reach {config['provider']} at this time. Please check your internet connection."
        ) from error
    except httpx.TimeoutException as error:
        raise NOVAServiceError(
            f"{config['provider']} took too long to respond. Please try your request again."
        ) from error
    except Exception as error:
        raise NOVAServiceError(
            f"Cloud AI service error: {str(error) or 'Unknown error occurred. Please try again.'}"
        ) from error
