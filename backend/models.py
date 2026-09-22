from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    # Accept old frontend fields such as ``model`` but never trust them.
    model_config = ConfigDict(extra="ignore")

    conversation_id: str = Field(min_length=1, max_length=128)
    request_id: str | None = Field(default=None, max_length=128)
    message: str = Field(default="", max_length=50_000)
    model: str | None = Field(default=None, max_length=128)
    image: str | None = Field(default=None, max_length=12_000_000)
    document: str | None = Field(default=None, max_length=12_000_000)
    document_name: str | None = Field(default=None, max_length=255)


class ChatMessage(BaseModel):
    role: str
    content: str
    image: str | None = None
    document_name: str | None = None


class ConversationSummary(BaseModel):
    id: str
    title: str
    updated_at: str
