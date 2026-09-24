"use client";

import React, { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Check, Copy } from "lucide-react";

interface MarkdownMessageProps {
  content: string;
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const rawCode = extractText(children);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback or permission denied
    }
  };

  return (
    <div className="nova-code-block">
      <header>
        <span>{lang || "code"}</span>
        <button
          type="button"
          className="nova-copy-code"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} style={{ marginRight: 4 }} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={12} style={{ marginRight: 4 }} />
              Copy
            </>
          )}
        </button>
      </header>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as any)) {
    return extractText((node as any).props.children);
  }
  return "";
}

function sanitizeMarkdown(content: string): string {
  if (!content) return "";
  // Ensure lines with tables don't get broken by raw multiple <br> tags
  // but keep valid breaks
  return content;
}

export const MarkdownMessage = memo(function MarkdownMessage({ content }: MarkdownMessageProps) {
  const sanitized = sanitizeMarkdown(content);

  return (
    <div className="nova-markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          table: ({ children, ...props }) => (
            <div className="nova-table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }: any) => {
            const isFenced = Boolean(className && className.includes("language-"));
            const rawText = String(children || "");
            const hasNewlines = rawText.includes("\n");

            if (isFenced || hasNewlines) {
              return (
                <CodeBlock className={className}>
                  {children}
                </CodeBlock>
              );
            }

            return (
              <code className="nova-inline-code" {...props}>
                {children}
              </code>
            );
          },
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownMessage;
