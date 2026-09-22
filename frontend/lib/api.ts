// The UI uses a same-origin proxy. No local service URL, model setting, or
// secret is exposed in the browser bundle.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  image?: string | null;
  document_name?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
    if (!response.ok) throw new Error(`NOVA backend returned ${response.status}.`);
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("NOVA cannot reach its local service. Please try again in a moment.");
    throw error;
  }
}

export const api = {
  session: () => request<{ ok: boolean }>("/auth/session"),
  conversations: () => request<Conversation[]>("/conversations"),
  messages: (id: string) => request<ChatMessage[]>(`/conversations/${id}/messages`),
  models: () => request<{ models: string[] }>("/models"),
  removeConversation: (id: string) => request<{ ok: boolean }>(`/conversations/${id}`, { method: "DELETE" }),
};
