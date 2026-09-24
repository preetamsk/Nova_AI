"use client";

import { Camera, Check, Copy, FileText, ImageIcon, ImagePlus, LogOut, Menu, Mic, MicOff, Moon, Plus, Search, Send, Settings, Sparkles, ThumbsDown, ThumbsUp, Trash2, User, Users, X } from "lucide-react";
import { ChangeEvent, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import NovaMark from "@/components/NovaMark";
import GuestAuthModal, { CURRENT_USER_KEY, NovaUser } from "@/components/GuestAuthModal";
import MarkdownMessage from "@/components/MarkdownMessage";
import { api, API_URL, ChatMessage, Conversation, getAuthHeaders, saveSessionToken } from "@/lib/api";

type Message = ChatMessage & { key: string };
interface StoredConversation {
  id: string;
  title: string;
  updated_at: string;
  messages: Message[];
}

const prompts = ["Explain quantum computing in simple terms", "Help me write a Python function", "Summarize this PDF document", "Give me ideas for a project"];
const id = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const decorate = (items: ChatMessage[]): Message[] => items.map((item) => ({ ...item, key: id() }));

function getStoredChats(phone: string): StoredConversation[] {
  if (typeof window === "undefined" || !phone) return [];
  try {
    const raw = localStorage.getItem(`nova_chats_${phone}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredChats(phone: string, chats: StoredConversation[]) {
  if (typeof window === "undefined" || !phone) return;
  try {
    localStorage.setItem(`nova_chats_${phone}`, JSON.stringify(chats));
  } catch {
    // LocalStorage quota or blocked
  }
}

const asDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Unable to read this file.")); reader.readAsDataURL(file); });
async function prepareImage(file: File) {
  const source = await asDataUrl(file);
  return new Promise<string>((resolve, reject) => { const image = new Image(); image.onload = () => { const ratio = Math.min(1, 1024 / Math.max(image.width, image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio); const context = canvas.getContext("2d"); if (!context) return reject(new Error("Unable to prepare image.")); context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .82)); }; image.onerror = () => reject(new Error("Unsupported image file.")); image.src = source; });
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<NovaUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState(id);
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState("");
  const [documentFile, setDocumentFile] = useState<{ name: string; data: string }>();
  const [preparing, setPreparing] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [history, setHistory] = useState(false);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState(false);
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down" | undefined>>({});
  const [copied, setCopied] = useState<string>();

  const imagePicker = useRef<HTMLInputElement | null>(null);
  const pdfPicker = useRef<HTMLInputElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  // Sync active conversation to isolated local storage for the current user's phone
  const syncConversationToLocal = (cId: string, currentMsgs: Message[], phoneOverride?: string) => {
    const phone = phoneOverride || currentUser?.phone;
    if (!phone || !currentMsgs.length) return;
    const allChats = getStoredChats(phone);
    const existingIndex = allChats.findIndex((c) => c.id === cId);
    const firstUserMsg = currentMsgs.find((m) => m.role === "user");
    const fallbackTitle = firstUserMsg
      ? firstUserMsg.content.slice(0, 32).trim() + (firstUserMsg.content.length > 32 ? "…" : "")
      : "New Conversation";
    const updatedChat: StoredConversation = {
      id: cId,
      title: existingIndex >= 0 ? allChats[existingIndex].title : fallbackTitle,
      updated_at: new Date().toISOString(),
      messages: currentMsgs,
    };
    const newChatList = existingIndex >= 0
      ? allChats.map((c, i) => (i === existingIndex ? updatedChat : c))
      : [updatedChat, ...allChats];
    saveStoredChats(phone, newChatList);
    setConversations(newChatList.map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at })));
  };

  // Check guest authentication on initial client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_USER_KEY);
      if (saved) {
        const user = JSON.parse(saved) as NovaUser;
        if (user && user.name && user.phone) {
          setCurrentUser(user);
          const userChats = getStoredChats(user.phone);
          setConversations(userChats.map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at })));
        } else {
          setAuthModalOpen(true);
        }
      } else {
        setAuthModalOpen(true);
      }
    } catch {
      setAuthModalOpen(true);
    }

    void api.models().then(({ models }) => {
      setModels(models);
      if (models.includes("openai/gpt-oss-120b")) setModel("openai/gpt-oss-120b");
      else if (models[0]) setModel(models[0]);
    }).catch(() => undefined);

    return () => {
      request.current?.abort();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleUserVerified = (user: NovaUser) => {
    setCurrentUser(user);
    setAuthModalOpen(false);
    const userChats = getStoredChats(user.phone);
    setConversations(userChats.map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at })));
    newChat();
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(CURRENT_USER_KEY);
      localStorage.removeItem("nova_saved_users");
    } catch {
      // LocalStorage blocked
    }
    request.current?.abort();
    setCurrentUser(null);
    setConversations([]);
    setMessages([]);
    setConversationId(id());
    setMessage("");
    clearAttachments();
    setSidebar(false);
    setAuthModalOpen(true);
  };

  const clearAttachments = () => { setImage(undefined); setImageName(""); setDocumentFile(undefined); };
  const newChat = () => {
    request.current?.abort();
    setMessages([]);
    setConversationId(id());
    setMessage("");
    clearAttachments();
    setSidebar(false);
    input.current?.focus();
  };

  const chooseImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) return alert("Choose an image smaller than 8 MB.");
    setPreparing(true);
    try { setImage(await prepareImage(file)); setImageName(file.name); }
    catch (error) { alert(error instanceof Error ? error.message : "Unable to prepare image."); }
    finally { setPreparing(false); }
  };

  const choosePdf = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 8 * 1024 * 1024) return alert("Choose a PDF smaller than 8 MB.");
    try { setDocumentFile({ name: file.name, data: await asDataUrl(file) }); }
    catch { alert("Unable to read this PDF."); }
  };

  const openChat = async (chat: Conversation) => {
    if (currentUser?.phone) {
      const userChats = getStoredChats(currentUser.phone);
      const found = userChats.find((c) => c.id === chat.id);
      if (found) {
        setMessages(found.messages);
        setConversationId(chat.id);
        setMessage("");
        clearAttachments();
        setHistory(false);
        setSidebar(false);
        return;
      }
    }
    try {
      setMessages(decorate(await api.messages(chat.id)));
      setConversationId(chat.id);
      setMessage("");
      clearAttachments();
      setHistory(false);
      setSidebar(false);
    } catch {
      alert("Could not load this conversation. Start the NOVA backend and retry.");
    }
  };

  const clearChat = async () => {
    if (currentUser?.phone) {
      const userChats = getStoredChats(currentUser.phone);
      const remaining = userChats.filter((c) => c.id !== conversationId);
      saveStoredChats(currentUser.phone, remaining);
      setConversations(remaining.map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at })));
    }
    if (messages.length) {
      try { await api.removeConversation(conversationId); } catch { /* unsaved chat */ }
    }
    newChat();
  };

  const receiveFrame = (frame: string, assistant: string) => {
    const event = frame.match(/^event:\s*([^\r\n]+)/m)?.[1]?.trim();
    const dataIdx = frame.indexOf("data:");
    if (!event || dataIdx === -1) return;
    const raw = frame.slice(dataIdx + 5).trim();
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { text?: string; message?: string };
      if (event === "token" && payload.text) {
        setMessages((items) => items.map((item) => item.key === assistant ? { ...item, content: item.content + payload.text } : item));
      }
      if (event === "error") {
        setMessages((items) => items.map((item) => item.key === assistant ? { ...item, content: `⚠️ ${payload.message || "NOVA could not complete this request."}` } : item));
      }
    } catch {
      /* Ignore malformed SSE packet. */
    }
  };

  const send = async (preset?: string) => {
    const text = (preset ?? message).trim();
    if (loading || preparing || (!text && !image && !documentFile)) return;
    const content = text || (image ? "Please analyse this image." : "Please analyse this PDF document.");
    const user: Message = { key: id(), role: "user", content, image, document_name: documentFile?.name };
    const assistant = id();
    const document = documentFile;
    const assistantMsg: Message = { key: assistant, role: "assistant", content: "" };
    const initialItems: Message[] = [...messages, user, assistantMsg];
    setMessages(initialItems);
    if (currentUser?.phone) {
      syncConversationToLocal(conversationId, initialItems, currentUser.phone);
    }
    setMessage("");
    clearAttachments();
    setLoading(true);

    try {
      const controller = new AbortController();
      request.current = controller;
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          conversation_id: conversationId,
          message: content,
          model,
          image: user.image,
          document: document?.data,
          document_name: document?.name,
          user_phone: currentUser?.phone,
          user_name: currentUser?.name,
        }),
      });

      const sessionToken = response.headers.get("x-nova-session");
      if (sessionToken) saveSessionToken(sessionToken);
      if (!response.ok || !response.body) throw new Error("Backend unavailable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const result = await reader.read();
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        frames.forEach((frame) => receiveFrame(frame, assistant));
        if (result.done) break;
      }
      if (buffer) receiveFrame(buffer, assistant);

      // Persist the completed conversation
      setMessages((finalItems) => {
        const cleaned = finalItems.map((item) =>
          item.key === assistant && !item.content.trim()
            ? { ...item, content: "⚠️ No response received from the cloud AI service. Please try again." }
            : item
        );
        if (currentUser?.phone) {
          syncConversationToLocal(conversationId, cleaned, currentUser.phone);
        }
        return cleaned;
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((items) => {
          const updated = items.map((item) =>
            item.key === assistant
              ? { ...item, content: "⚠️ Failed to fetch. Start the NOVA backend or check cloud API connection." }
              : item
          );
          if (currentUser?.phone) {
            syncConversationToLocal(conversationId, updated, currentUser.phone);
          }
          return updated;
        });
      }
    } finally {
      request.current = null;
      setLoading(false);
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith("image/")) void chooseImage(file);
    else if (file.type === "application/pdf") void choosePdf(file);
    else alert("Drop an image or PDF document.");
  };

  const openCamera = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true });
      setCamera(true);
      window.setTimeout(() => { if (video.current) video.current.srcObject = stream.current ?? null; }, 0);
    } catch {
      alert("Camera access is unavailable. Use image upload instead.");
    }
  };

  const capture = () => {
    if (!video.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth || 1024;
    canvas.height = video.current.videoHeight || 768;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    setImage(canvas.toDataURL("image/jpeg", .8));
    setImageName("camera-capture.jpg");
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
  };

  const voice = () => {
    const browser = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) return alert("Voice input is not supported in this browser.");
    if (listening) return;
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event: any) => setMessage((current) => `${current} ${event.results[0][0].transcript}`.trim());
    recognition.onerror = recognition.onend = () => setListening(false);
    recognition.start();
  };

  const copy = async (item: Message) => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(item.key);
      setTimeout(() => setCopied((current) => current === item.key ? undefined : current), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const results = useMemo(
    () => conversations.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())),
    [conversations, query]
  );

  return (
    <main className="nova-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="sidebar-brand">
          <NovaMark />
          <span>NOVA AI</span>
        </div>
        <button className="new-chat" onClick={newChat}>
          <Plus size={20} />
          New Chat
        </button>
        <p className="section-label">RECENT CHATS</p>
        <div className="conversation-list">
          {conversations.length ? (
            conversations.map((chat) => (
              <button
                key={chat.id}
                className={chat.id === conversationId ? "conversation active" : "conversation"}
                onClick={() => void openChat(chat)}
              >
                <span className="conversation-dot" />
                {chat.title}
              </button>
            ))
          ) : (
            <p className="empty-history">Your conversations will appear here.</p>
          )}
        </div>

        {/* Sidebar User Profile Card & Switcher */}
        <div className="sidebar-user-section">
          <div
            className="sidebar-user-card"
            title="Switch Profile / Change Account"
          >
            <div className="sidebar-user-info" onClick={() => setAuthModalOpen(true)}>
              <span className="topbar-user-avatar">
                {currentUser ? currentUser.name.charAt(0).toUpperCase() : "G"}
              </span>
              <div>
                <strong>{currentUser?.name || "Guest User"}</strong>
                <span className="sidebar-user-phone">
                  {currentUser ? currentUser.phone : "Click to verify"}
                </span>
              </div>
            </div>
            {currentUser ? (
              <button
                type="button"
                className="sidebar-logout-btn"
                title="Log Out"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
              >
                <LogOut size={16} />
              </button>
            ) : (
              <span onClick={() => setAuthModalOpen(true)} style={{ fontSize: "11px", color: "#818cf8", fontWeight: 600, cursor: "pointer" }}>Verify</span>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-profile-btn"
            onClick={() => setAuthModalOpen(true)}
            title="View Active Profile"
          >
            <User size={18} />
            <span>Profile ({currentUser ? currentUser.name : "Guest"})</span>
          </button>

          <button
            type="button"
            className="sidebar-switch-profile-btn"
            onClick={() => setAuthModalOpen(true)}
            title="Switch User Profile"
          >
            <Users size={18} />
            <span>Switch Profile</span>
          </button>

          {currentUser && (
            <button
              type="button"
              className="sidebar-logout-btn-full"
              onClick={handleLogout}
              title="Log Out"
            >
              <LogOut size={18} />
              <span>Log Out</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void clearChat()}
            title="Clear Chat"
          >
            <Trash2 size={18} />
            <span>Clear</span>
          </button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div className="topbar-brand">
            <NovaMark compact />
            <div>
              <strong>NOVA AI</strong>
              <span>Your Personal AI Assistant</span>
            </div>
          </div>
          <div className="topbar-actions">
            <select aria-label="Select model" value={model} onChange={(event) => setModel(event.target.value)}>
              {models.length ? models.map((name) => <option key={name}>{name}</option>) : <option>{model}</option>}
            </select>

            {/* Profile badge in topbar */}
            {currentUser ? (
              <>
                <button
                  type="button"
                  className="topbar-user-pill"
                  title={`Logged in as ${currentUser.name} (${currentUser.phone}) - Click to switch profile`}
                  onClick={() => setAuthModalOpen(true)}
                >
                  <span className="topbar-user-avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
                  <span className="topbar-user-name">{currentUser.name}</span>
                </button>
                <button
                  type="button"
                  className="topbar-logout-btn"
                  title="Log Out"
                  onClick={handleLogout}
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="topbar-user-pill"
                title="Verify Guest Access"
                onClick={() => setAuthModalOpen(true)}
              >
                <User size={16} />
                <span>Verify</span>
              </button>
            )}

            <button title="Search conversation history" onClick={() => setHistory(true)}>
              <Search size={21} />
            </button>
            <button title="Toggle sidebar" onClick={() => setSidebar((value) => !value)}>
              <Menu size={23} />
            </button>
            <button title="Dark theme">
              <Moon size={20} />
            </button>
          </div>
        </header>

        <div
          className="chat-scroll"
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          {dragging && (
            <div className="drop-overlay">
              <ImagePlus size={30} />
              Drop an image or PDF to attach it
            </div>
          )}
          {!messages.length ? (
            <section className="welcome">
              <NovaMark />
              <h1>
                {currentUser ? `Welcome, ${currentUser.name}` : "Welcome to NOVA AI"} <span>👋</span>
              </h1>
              <p>How can I help you today?</p>
              <div className="quick-prompts">
                {prompts.map((prompt, index) => (
                  <button key={prompt} onClick={() => void send(prompt)}>
                    <Sparkles className={`prompt-icon icon-${index}`} size={18} />
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="message-list">
              {messages.map((item) => (
                <article key={item.key} className={`message-row ${item.role}`}>
                  <div className={`message-bubble ${item.role} ${item.image ? "with-image" : ""}`}>
                    {item.image && (
                      <div className="image-card">
                        <div><ImageIcon size={14} />Image attached</div>
                        <img src={item.image} alt="Image supplied for AI analysis" />
                      </div>
                    )}
                    {item.document_name && (
                      <div className="document-card">
                        <FileText size={18} />
                        <span><b>PDF attached</b>{item.document_name}</span>
                      </div>
                    )}
                    {item.content && (
                      item.role === "assistant" ? (
                        <MarkdownMessage content={item.content} />
                      ) : (
                        <p>{item.content}</p>
                      )
                    )}
                    {item.role === "assistant" && !item.content && loading && (
                      <span className="typing"><i /><i /><i /></span>
                    )}
                  </div>
                  {item.role === "assistant" && item.content && (
                    <div className="assistant-actions">
                      <button
                        className={feedback[item.key] === "up" ? "selected" : ""}
                        title="Good response"
                        onClick={() => setFeedback((all) => ({ ...all, [item.key]: all[item.key] === "up" ? undefined : "up" }))}
                      >
                        <ThumbsUp size={16} />
                      </button>
                      <button
                        className={feedback[item.key] === "down" ? "selected" : ""}
                        title="Poor response"
                        onClick={() => setFeedback((all) => ({ ...all, [item.key]: all[item.key] === "down" ? undefined : "down" }))}
                      >
                        <ThumbsDown size={16} />
                      </button>
                      <button title="Copy response" onClick={() => void copy(item)}>
                        {copied === item.key ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="composer-zone">
          {(image || documentFile) && (
            <div className="attachment-tray">
              {image && (
                <div className="attachment image-attachment">
                  <img src={image} alt="Pending upload" />
                  <span>{imageName}</span>
                  <button onClick={() => { setImage(undefined); setImageName(""); }}><X size={15} /></button>
                </div>
              )}
              {documentFile && (
                <div className="attachment">
                  <FileText size={18} />
                  <span>{documentFile.name}</span>
                  <button onClick={() => setDocumentFile(undefined)}><X size={15} /></button>
                </div>
              )}
            </div>
          )}
          <div className={`composer ${dragging ? "dragging" : ""}`}>
            <div className="composer-tools">
              <button title="Attach image" onClick={() => imagePicker.current?.click()}>
                <ImagePlus size={21} />
              </button>
              <button title="Attach PDF" onClick={() => pdfPicker.current?.click()}>
                <FileText size={20} />
              </button>
              <button title="Open camera" onClick={() => void openCamera()}>
                <Camera size={20} />
              </button>
              <button title="Voice input" className={listening ? "recording" : ""} onClick={voice}>
                {listening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            </div>
            <textarea
              ref={input}
              rows={1}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={keyDown}
              placeholder="Ask NOVA AI anything..."
            />
            {loading ? (
              <button className="send stop" title="Stop response" onClick={() => request.current?.abort()}>
                <span />
              </button>
            ) : (
              <button
                className="send"
                title="Send message"
                disabled={preparing || (!message.trim() && !image && !documentFile)}
                onClick={() => void send()}
              >
                <Send size={21} />
              </button>
            )}
          </div>
          <p className="drop-hint">
            {preparing ? "Preparing image for analysis…" : "Drop an image here to analyse it, or choose an attachment."}
          </p>
          <p className="disclaimer">NOVA AI can make mistakes. Consider checking important information.</p>
          <input
            hidden
            ref={imagePicker}
            type="file"
            accept="image/*"
            onChange={(event: ChangeEvent<HTMLInputElement>) => void chooseImage(event.target.files?.[0])}
          />
          <input
            hidden
            ref={pdfPicker}
            type="file"
            accept="application/pdf"
            onChange={(event: ChangeEvent<HTMLInputElement>) => void choosePdf(event.target.files?.[0])}
          />
        </footer>
      </section>

      {/* History Search Modal */}
      {history && (
        <div className="modal-backdrop" onMouseDown={() => setHistory(false)}>
          <section className="history-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <Search size={19} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search conversations"
                />
              </div>
              <button onClick={() => setHistory(false)}>
                <X size={19} />
              </button>
            </header>
            <div>
              {results.length ? (
                results.map((chat) => (
                  <button key={chat.id} onClick={() => void openChat(chat)}>
                    <span>{chat.title}</span>
                    <small>{new Date(chat.updated_at).toLocaleDateString()}</small>
                  </button>
                ))
              ) : (
                <p>No matching conversations.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Camera Capture Modal */}
      {camera && (
        <div className="modal-backdrop">
          <section className="camera-modal">
            <header>
              <span>Take a photo</span>
              <button
                onClick={() => {
                  stream.current?.getTracks().forEach((track) => track.stop());
                  stream.current = null;
                  setCamera(false);
                }}
              >
                <X size={19} />
              </button>
            </header>
            <video ref={video} autoPlay playsInline />
            <button className="capture" onClick={capture}>
              <Camera size={19} />Capture image
            </button>
          </section>
        </div>
      )}

      {/* Guest Authentication & Onboarding Modal */}
      <GuestAuthModal
        isOpen={authModalOpen}
        currentUser={currentUser}
        onSuccess={handleUserVerified}
        onClose={() => setAuthModalOpen(false)}
        onLogout={handleLogout}
      />
    </main>
  );
}
