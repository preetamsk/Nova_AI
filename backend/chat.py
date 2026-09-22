import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from models import ChatMessage, ChatRequest, ConversationSummary
from services.auth_service import current_user_id
from services.history_service import (
    ConversationNotFound,
    delete_conversation,
    delete_message,
    get_conversations,
    get_messages,
    save_message,
)
from services.ollama_service import NOVAServiceError, display_model_name, list_models, stream_response
from services.rate_limit import chat_rate_limiter
from settings import get_settings


router = APIRouter()
ACTIVE_REQUESTS: set[str] = set()
CANCELLED_REQUESTS: set[str] = set()


def _event(event: str, payload: dict[str, str]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def _request_key(user_id: str, request_id: str) -> str:
    return f"{user_id}:{request_id}"


def _checked_attachment(value: str | None, prefix: str, label: str) -> str | None:
    if value is None:
        return None
    if not value.startswith(prefix) or "," not in value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Please attach a valid {label}.")
    if len(value.encode("utf-8")) > int(get_settings().max_upload_bytes * 1.37):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"That {label} is too large. Please choose a file under {get_settings().max_upload_bytes // 1_048_576} MB.",
        )
    return value


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")


@router.get("/auth/session")
def session(_: str = Depends(current_user_id)) -> dict[str, bool]:
    return {"ok": True}


@router.get("/models")
def models() -> dict[str, list[str]]:
    try:
        return {"models": [display_model_name(), *list_models()]}
    except NOVAServiceError:
        return {"models": [display_model_name()]}


@router.get("/conversations", response_model=list[ConversationSummary])
def conversations(user_id: str = Depends(current_user_id)) -> list[ConversationSummary]:
    return get_conversations(user_id)


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessage])
def messages(conversation_id: str, user_id: str = Depends(current_user_id)) -> list[ChatMessage]:
    try:
        return get_messages(user_id, conversation_id)
    except ConversationNotFound as error:
        raise _not_found() from error


@router.delete("/conversations/{conversation_id}")
def remove_conversation(conversation_id: str, user_id: str = Depends(current_user_id)) -> dict[str, bool]:
    try:
        delete_conversation(user_id, conversation_id)
    except ConversationNotFound as error:
        raise _not_found() from error
    return {"ok": True}


@router.post("/chat/cancel/{request_id}")
def cancel_chat(request_id: str, user_id: str = Depends(current_user_id)) -> dict[str, bool]:
    request_key = _request_key(user_id, request_id)
    if request_key in ACTIVE_REQUESTS:
        CANCELLED_REQUESTS.add(request_key)
    return {"ok": True}


@router.post("/chat/stream")
async def chat_stream(
    data: ChatRequest, request: Request, response: Response, user_id: str = Depends(current_user_id)
) -> StreamingResponse:
    image = _checked_attachment(data.image, "data:image/", "image")
    document = _checked_attachment(data.document, "data:application/pdf", "PDF")
    client_ip = request.client.host if request.client else "unknown"
    chat_rate_limiter.check(f"{user_id}:{client_ip}")

    async def generate() -> AsyncIterator[str]:
        question = data.message.strip() or (
            "Please analyse the attached image." if image else "Please analyse the attached PDF document."
        )
        request_key = _request_key(user_id, data.request_id) if data.request_id else None
        if request_key:
            ACTIVE_REQUESTS.add(request_key)
        user_message_id = save_message(user_id, data.conversation_id, "user", question, image, data.document_name)
        completed = False

        async def stopped() -> bool:
            return bool(request_key and request_key in CANCELLED_REQUESTS) or await request.is_disconnected()

        async def show_error(text: str) -> AsyncIterator[str]:
            nonlocal completed
            if await stopped():
                return
            visible_text = f"⚠️ {text}"
            try:
                save_message(user_id, data.conversation_id, "assistant", visible_text)
            except Exception:
                pass
            completed = True
            yield _event("token", {"text": visible_text})
            yield _event("done", {"model": display_model_name()})

        try:
            history = get_messages(user_id, data.conversation_id)
            answer = ""
            for token in stream_response(history, image, document, data.document_name, data.model):
                if await stopped():
                    return
                answer += token
                yield _event("token", {"text": token})
            if await stopped():
                return
            final_answer = answer or "NOVA could not generate a response. Please try again."
            save_message(user_id, data.conversation_id, "assistant", final_answer)
            completed = True
            yield _event("done", {"model": display_model_name()})
        except NOVAServiceError as error:
            async for event in show_error(str(error)):
                yield event
        except Exception as error:
            async for event in show_error(str(error) or "NOVA could not complete that request. Please try again."):
                yield event
        finally:
            if not completed and await stopped():
                delete_message(user_id, user_message_id)
            if request_key:
                ACTIVE_REQUESTS.discard(request_key)
                CANCELLED_REQUESTS.discard(request_key)

    headers = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    if "x-nova-session" in response.headers:
        headers["x-nova-session"] = response.headers["x-nova-session"]
    streamed = StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers=headers,
    )
    for cookie in response.headers.getlist("set-cookie"):
        streamed.headers.append("set-cookie", cookie)
    return streamed
