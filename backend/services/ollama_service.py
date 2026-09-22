"""Low-memory streaming connection to this computer's private Ollama server."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx

from models import ChatMessage
from services.document_service import extract_pdf_content
from settings import get_settings


class NOVAServiceError(RuntimeError):
    """A user-safe explanation for an Ollama failure."""


def _decode_data_url(value: str) -> str:
    return value.split(",", 1)[-1]


def _installed_models() -> list[str]:
    settings = get_settings()
    try:
        response = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=4)
        response.raise_for_status()
        return [str(item.get("name", "")) for item in response.json().get("models", []) if item.get("name")]
    except httpx.HTTPError as error:
        raise NOVAServiceError("NOVA cannot reach Ollama. Open Ollama, wait a moment, then try again.") from error


def list_models() -> list[str]:
    return _installed_models()


def display_model_name() -> str:
    return "Automatic (local Ollama)"


def _available(configured: str, installed: list[str]) -> str | None:
    wanted = configured.lower()
    return next((model for model in installed if model.lower() == wanted), None) or next(
        (model for model in installed if model.lower().startswith(wanted.split(":", 1)[0])), None
    )


def _select_model(vision: bool) -> str:
    settings = get_settings()
    installed = _installed_models()
    preferred = settings.ollama_vision_model if vision else settings.ollama_text_model
    selected = _available(preferred, installed)
    if selected:
        return selected
    if vision:
        raise NOVAServiceError(
            f"NOVA needs the local vision model '{preferred}' for this attachment. Start Ollama and install that model, then try again."
        )
    raise NOVAServiceError(
        f"NOVA cannot find the local text model '{preferred}'. Start Ollama and install that model, then try again."
    )


def _messages(history: list[ChatMessage], image: str | None, document: str | None, document_name: str | None) -> tuple[list[dict[str, object]], bool]:
    # Limit retained context so a small laptop stays responsive even in long chats.
    messages: list[dict[str, object]] = [
        {
            "role": "system",
            "content": "You are NOVA, a helpful personal AI assistant. Give direct, accurate answers. Use code fences for code.",
        }
    ]
    recent = history[-12:]
    for item in recent:
        content = item.content[-6_000:]
        messages.append({"role": item.role if item.role in {"user", "assistant"} else "user", "content": content})

    attachments: list[str] = []
    attachment_text = ""
    if image:
        attachments.append(_decode_data_url(image))
        attachment_text = "\n\nAnalyse the attached image and answer the user's request."
    if document:
        pdf = extract_pdf_content(document)
        attachment_text += f"\n\nAttached PDF: {document_name or 'document.pdf'}\n{pdf.text}"
        attachments.extend(pdf.page_images)

    if attachment_text:
        last = messages[-1]
        last["content"] = f"{last['content']}{attachment_text}"
    if attachments:
        messages[-1]["images"] = attachments
    return messages, bool(attachments)


def stream_response(
    history: list[ChatMessage], image: str | None, document: str | None, document_name: str | None
) -> Iterator[str]:
    settings = get_settings()
    messages, needs_vision = _messages(history, image, document, document_name)
    model = _select_model(needs_vision)
    options: dict[str, object] = {
        "temperature": 0.35,
        "num_ctx": 768 if needs_vision else settings.ollama_num_ctx,
        "num_predict": 256 if needs_vision else settings.ollama_num_predict,
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "keep_alive": settings.ollama_keep_alive,
        "options": options,
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(connect=5, read=120, write=20, pool=5)) as client:
            with client.stream("POST", f"{settings.ollama_base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield str(content)
                    if chunk.get("done"):
                        return
    except NOVAServiceError:
        raise
    except httpx.ConnectError as error:
        raise NOVAServiceError("NOVA cannot reach Ollama. Open Ollama, wait a moment, then try again.") from error
    except httpx.TimeoutException as error:
        raise NOVAServiceError("Ollama took too long to respond. Close memory-heavy apps and try again.") from error
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 404:
            raise NOVAServiceError(f"The local Ollama model '{model}' is not available. Start Ollama and try again.") from error
        raise NOVAServiceError("Ollama could not complete that request. Please try again.") from error
    except (json.JSONDecodeError, RuntimeError) as error:
        raise NOVAServiceError(str(error) or "Ollama could not complete that request. Please try again.") from error
