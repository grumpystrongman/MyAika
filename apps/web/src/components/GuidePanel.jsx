import { useEffect, useMemo, useState } from "react";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeUrl(url) {
  const raw = String(url || "");
  if (!raw) return raw;
  if (raw.startsWith("/") || raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `/docs/${raw}`;
}

function applyInlineMarkup(text) {
  let output = escapeHtml(text);

  // Images: ![alt](url)
  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const safeAlt = escapeHtml(alt);
    const safeUrl = escapeHtml(normalizeUrl(url));
    return `<img src="${safeUrl}" alt="${safeAlt}" />`;
  });

  // Links: [text](url)
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    const safeLabel = escapeHtml(label);
    const safeUrl = escapeHtml(normalizeUrl(url));
    return `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
  });

  // Inline code: `code`
  output = output.replace(/`([^`]+)`/g, (_match, code) => {
    const safeCode = escapeHtml(code);
    return `<code>${safeCode}</code>`;
  });

  // Bold: **text**
  output = output.replace(/\*\*([^*]+)\*\*/g, (_match, bold) => {
    const safeBold = escapeHtml(bold);
    return `<strong>${safeBold}</strong>`;
  });

  // Italic: *text*
  output = output.replace(/\*([^*]+)\*/g, (_match, italic) => {
    const safeItalic = escapeHtml(italic);
    return `<em>${safeItalic}</em>`;
  });

  return output;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const htmlParts = [];
  let inCode = false;
  let codeBuffer = [];
  let paragraphBuffer = [];
  let listType = "";
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join(" ").trim();
    if (text) htmlParts.push(`<p>${applyInlineMarkup(text)}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    htmlParts.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listType = "";
    listItems = [];
  };

  const flushCode = () => {
    if (!codeBuffer.length) return;
    const code = escapeHtml(codeBuffer.join("\n"));
    htmlParts.push(`<pre><code>${code}</code></pre>`);
    codeBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const content = applyInlineMarkup(headingMatch[2]);
      htmlParts.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    const ulMatch = /^-\s+(.+)$/.exec(line);
    if (ulMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(`<li>${applyInlineMarkup(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(`<li>${applyInlineMarkup(olMatch[1])}</li>`);
      continue;
    }

    paragraphBuffer.push(line.trim());
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();

  return htmlParts.join("\n");
}

export default function GuidePanel() {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Loading guide...");

  useEffect(() => {
    let active = true;
    async function loadGuide() {
      try {
        const resp = await fetch("/docs/USER_GUIDE.md");
        if (!resp.ok) throw new Error("guide_load_failed");
        const text = await resp.text();
        if (active) {
          setContent(text);
          setStatus("");
        }
      } catch (err) {
        if (active) {
          setStatus("Guide not available. Check /docs/USER_GUIDE.md");
        }
      }
    }
    loadGuide();
    return () => {
      active = false;
    };
  }, []);

  const html = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
        Full User Guide
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => window.open("/docs/USER_GUIDE.md", "_blank")}
          style={{ padding: "6px 10px", borderRadius: 8 }}
        >
          Open Markdown
        </button>
      </div>
      {status && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{status}</div>
      )}
      {!status && (
        <div
          className="guide-content"
          style={{
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            padding: 16,
            background: "var(--panel-bg)",
            maxHeight: "70vh",
            overflow: "auto"
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <style jsx>{`
        .guide-content {
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-primary);
        }
        .guide-content h1 {
          font-size: 20px;
          margin: 12px 0 8px;
        }
        .guide-content h2 {
          font-size: 16px;
          margin: 12px 0 8px;
        }
        .guide-content h3 {
          font-size: 14px;
          margin: 10px 0 6px;
        }
        .guide-content p {
          margin: 6px 0;
        }
        .guide-content ul,
        .guide-content ol {
          margin: 6px 0 6px 20px;
        }
        .guide-content li {
          margin: 4px 0;
        }
        .guide-content code {
          font-family: "IBM Plex Mono", monospace;
          background: var(--panel-bg-soft);
          border: 1px solid var(--panel-border);
          border-radius: 6px;
          padding: 1px 4px;
          font-size: 12px;
        }
        .guide-content pre {
          background: var(--code-bg);
          color: var(--code-text);
          padding: 10px;
          border-radius: 8px;
          overflow: auto;
        }
        .guide-content img {
          max-width: 100%;
          border-radius: 10px;
          border: 1px solid var(--panel-border);
          margin: 8px 0;
        }
        .guide-content a {
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

