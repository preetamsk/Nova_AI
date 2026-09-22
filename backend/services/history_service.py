"""Database-backed, per-session conversation history.

Uses SQLite for a local developer setup and the same SQLAlchemy models with
PostgreSQL (for example Neon) in deployment.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from models import ChatMessage, ConversationSummary
from settings import get_settings


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def _make_engine(url: str) -> Engine:
    options: dict[str, object] = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **options)


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
_legacy_profile_claimed = False


class ConversationNotFound(Exception):
    pass


def configure_database(database_url: str) -> None:
    """Swap database connections in tests; production never calls this."""
    global engine, SessionLocal, _legacy_profile_claimed
    engine.dispose()
    engine = _make_engine(database_url)
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    _legacy_profile_claimed = False


def _now() -> datetime:
    return datetime.now(UTC)


def initialize_database() -> None:
    """Create tables and safely adopt the old local SQLite schema once."""
    inspector = inspect(engine)
    if "conversations" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("conversations")}
        if "user_id" not in columns:
            with engine.begin() as connection:
                connection.exec_driver_sql("ALTER TABLE conversations ADD COLUMN user_id VARCHAR(128)")
                connection.exec_driver_sql(
                    "UPDATE conversations SET user_id = 'legacy-local-user' WHERE user_id IS NULL"
                )
    Base.metadata.create_all(bind=engine)


def claim_legacy_local_profile() -> str | None:
    """Give a pre-cloud local profile to one local browser, never to production.

    This preserves an existing developer's chats while ensuring new local test
    or private windows receive their own isolated browser identity.
    """
    global _legacy_profile_claimed
    if get_settings().is_production or _legacy_profile_claimed:
        return None
    with SessionLocal() as db:
        existing = db.scalar(
            select(Conversation.id).where(Conversation.user_id == "legacy-local-user").limit(1)
        )
    if existing is None:
        return None
    _legacy_profile_claimed = True
    return "legacy-local-user"


def _conversation_for_user(db: Session, user_id: str, conversation_id: str) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user_id:
        raise ConversationNotFound
    return conversation


def save_message(
    user_id: str,
    conversation_id: str,
    role: str,
    content: str,
    image: str | None = None,
    document_name: str | None = None,
) -> int:
    now = _now()
    title = (content or document_name or "New conversation").replace("\n", " ").strip()[:52] or "New conversation"
    with SessionLocal.begin() as db:
        conversation = db.get(Conversation, conversation_id)
        if conversation is None:
            conversation = Conversation(
                id=conversation_id,
                user_id=user_id,
                title=title,
                created_at=now,
                updated_at=now,
            )
            db.add(conversation)
        else:
            _conversation_for_user(db, user_id, conversation_id)
            conversation.updated_at = now
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            image=image,
            document_name=document_name,
            created_at=now,
        )
        db.add(message)
        db.flush()
        return message.id


def delete_message(user_id: str, message_id: int) -> None:
    with SessionLocal.begin() as db:
        message = db.get(Message, message_id)
        if message is None:
            return
        _conversation_for_user(db, user_id, message.conversation_id)
        conversation_id = message.conversation_id
        db.delete(message)
        db.flush()
        if db.scalar(select(Message.id).where(Message.conversation_id == conversation_id).limit(1)) is None:
            db.delete(_conversation_for_user(db, user_id, conversation_id))


def get_messages(user_id: str, conversation_id: str) -> list[ChatMessage]:
    with SessionLocal() as db:
        _conversation_for_user(db, user_id, conversation_id)
        rows = db.scalars(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id.asc())
        ).all()
    return [ChatMessage(role=row.role, content=row.content, image=row.image, document_name=row.document_name) for row in rows]


def get_conversations(user_id: str) -> list[ConversationSummary]:
    with SessionLocal() as db:
        rows = db.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
        ).all()
    return [
        ConversationSummary(id=row.id, title=row.title, updated_at=row.updated_at.isoformat())
        for row in rows
    ]


def delete_conversation(user_id: str, conversation_id: str) -> None:
    with SessionLocal.begin() as db:
        _conversation_for_user(db, user_id, conversation_id)
        db.query(Message).filter(Message.conversation_id == conversation_id).delete()
        db.delete(_conversation_for_user(db, user_id, conversation_id))
