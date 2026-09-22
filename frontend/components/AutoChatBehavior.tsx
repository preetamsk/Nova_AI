"use client";

import { useEffect } from "react";

const streamPath = "/chat/stream";

function enhanceCodeBlocks(root: ParentNode) {
  root.querySelectorAll<HTMLParagraphElement>(".message-bubble.assistant p").forEach((paragraph) => {
    if (paragraph.querySelector(".nova-code-block")) return;
    const source = paragraph.textContent ?? "";
    const matcher = /```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    let foundCode = false;
    const fragment = document.createDocumentFragment();
    const appendText = (text: string) => {
      if (!text) return;
      const span = document.createElement("span");
      span.className = "nova-message-text";
      span.textContent = text;
      fragment.append(span);
    };
    while ((match = matcher.exec(source))) {
      foundCode = true;
      appendText(source.slice(cursor, match.index));
      cursor = match.index + match[0].length;
      const language = match[1] || "code";
      const code = match[2].replace(/\n$/, "");
      const card = document.createElement("section");
      card.className = "nova-code-block";
      const header = document.createElement("header");
      const label = document.createElement("span");
      label.textContent = language;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "nova-copy-code";
      copy.textContent = "Copy code";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(code); copy.textContent = "Copied"; }
        catch { copy.textContent = "Copy failed"; }
        window.setTimeout(() => { copy.textContent = "Copy code"; }, 1500);
      });
      header.append(label, copy);
      const pre = document.createElement("pre");
      const codeElement = document.createElement("code");
      codeElement.textContent = code;
      pre.append(codeElement);
      card.append(header, pre);
      fragment.append(card);
    }
    if (!foundCode) return;
    appendText(source.slice(cursor));
    paragraph.replaceChildren(fragment);
  });
}

export default function AutoChatBehavior() {
  useEffect(() => {
    let followLatest = true;
    let keepSidebarOpen = false;
    let feed: HTMLElement | null = null;
    const originalFetch = window.fetch.bind(window);

    const scrollToNewest = (force = false) => {
      feed ??= document.querySelector<HTMLElement>(".chat-scroll");
      if (feed && (followLatest || force)) feed.scrollTo({ top: feed.scrollHeight, behavior: force ? "smooth" : "auto" });
    };
    const onScroll = () => { if (feed) followLatest = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 70; };
    const connectScroll = () => {
      const next = document.querySelector<HTMLElement>(".chat-scroll");
      if (!next || next === feed) return;
      feed?.removeEventListener("scroll", onScroll);
      feed = next;
      feed.addEventListener("scroll", onScroll, { passive: true });
    };
    const restoreSidebar = () => { if (keepSidebarOpen) document.querySelector<HTMLElement>(".sidebar")?.classList.add("open"); };

    // The page owns the response reader.  This lightweight wrapper only adds
    // cookie credentials to the cross-port local/hosted API call; wrapping the
    // streaming body here previously swallowed reply chunks in some browsers.
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes(streamPath)) return originalFetch(input, init);
      return originalFetch(input, { ...init, credentials: "include" });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('button[title="Send message"]')) { followLatest = true; window.requestAnimationFrame(() => scrollToNewest(true)); return; }
      if (target.closest('button[title="Toggle sidebar"]')) { keepSidebarOpen = !Boolean(document.querySelector(".sidebar.open")); return; }
      if (target.closest(".sidebar")) { keepSidebarOpen = true; window.setTimeout(restoreSidebar, 0); return; }
      if (!target.closest("button, a, input, textarea, select, label, .modal-backdrop")) document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus({ preventScroll: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && (event.target as Element | null)?.matches(".composer textarea")) {
        followLatest = true;
        window.requestAnimationFrame(() => scrollToNewest(true));
      }
    };
    const observer = new MutationObserver((records) => {
      connectScroll();
      enhanceCodeBlocks(document);
      const addedMessage = records.some((record) => record.type === "childList" && [...record.addedNodes].some((node) => node instanceof Element && (node.classList.contains("message-row") || Boolean(node.querySelector?.(".message-row")))));
      if (addedMessage) followLatest = true;
      restoreSidebar();
      window.requestAnimationFrame(() => scrollToNewest(addedMessage));
    });
    connectScroll();
    enhanceCodeBlocks(document);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.fetch = originalFetch;
      feed?.removeEventListener("scroll", onScroll);
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  return null;
}
