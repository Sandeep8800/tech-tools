import React, { useMemo } from "react";

interface MarkdownProps {
  content: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ content }) => {
  const renderedElements = useMemo(() => {
    if (!content) return null;

    const parts: React.ReactNode[] = [];
    // Split by code blocks
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)(```|$)/g;
    let lastIndex = 0;
    let match;

    let keyCounter = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      const language = match[1] || "text";
      const code = match[2];

      // Add text before the code block
      if (textBefore) {
        parts.push(renderTextWithInlineFormatting(textBefore, `text-${keyCounter++}`));
      }

      // Add the code block
      parts.push(
        <div key={`code-${keyCounter++}`} className="my-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-900 text-gray-100 font-mono text-sm">
          <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 text-xs text-gray-400 select-none border-b border-gray-700">
            <span>{language || "code"}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(code);
              }}
              className="hover:text-white transition-colors duration-150 flex items-center gap-1 active:scale-95"
            >
              Copy
            </button>
          </div>
          <pre className="p-4 overflow-x-auto select-text">
            <code>{code}</code>
          </pre>
        </div>
      );

      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(renderTextWithInlineFormatting(content.substring(lastIndex), `text-${keyCounter++}`));
    }

    return parts;
  }, [content]);

  return <div className="space-y-2 text-gray-800 leading-relaxed text-sm md:text-base break-words">{renderedElements}</div>;
};

function renderTextWithInlineFormatting(text: string, baseKey: string): React.ReactNode {
  // Split into paragraphs
  const paragraphs = text.split("\n\n");
  
  return (
    <div key={baseKey} className="space-y-3">
      {paragraphs.map((p, pIdx) => {
        if (!p.trim()) return null;

        // Check if it's a list
        const lines = p.split("\n");
        const isList = lines.every(line => line.trim().startsWith("- ") || line.trim().startsWith("* ") || /^\d+\.\s/.test(line.trim()));

        if (isList) {
          return (
            <ul key={`list-${pIdx}`} className="list-disc pl-5 space-y-1 my-2">
              {lines.map((line, lIdx) => {
                const cleanLine = line.trim().replace(/^(-\s|\*\s|\d+\.\s)/, "");
                return (
                  <li key={`li-${lIdx}`} className="text-gray-700">
                    {parseInlineStyles(cleanLine)}
                  </li>
                );
              })}
            </ul>
          );
        }

        // Check if it's a heading
        if (p.startsWith("#")) {
          const match = p.match(/^(#{1,6})\s+(.*)$/);
          if (match) {
            const level = match[1].length;
            const headingText = match[2];
            const headingClasses = 
              level === 1 ? "text-2xl font-bold text-gray-900 mt-4 mb-2 tracking-tight" :
              level === 2 ? "text-xl font-bold text-gray-900 mt-3 mb-2 tracking-tight" :
              "text-lg font-semibold text-gray-900 mt-2 mb-1 tracking-tight";
            const HeadingTag = `h${level}` as any;
            return React.createElement(HeadingTag, {
              key: `h-${pIdx}`,
              className: headingClasses
            }, parseInlineStyles(headingText));
          }
        }

        return (
          <p key={`p-${pIdx}`} className="text-gray-700">
            {parseInlineStyles(p)}
          </p>
        );
      })}
    </div>
  );
}

function parseInlineStyles(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex to split by bold (**text**), italics (*text* or _text_), and inline code (`code`)
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const segments = text.split(regex);

  segments.forEach((seg, idx) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      parts.push(<strong key={idx} className="font-semibold text-gray-900">{seg.slice(2, -2)}</strong>);
    } else if (seg.startsWith("*") && seg.endsWith("*")) {
      parts.push(<em key={idx} className="italic text-gray-800">{seg.slice(1, -1)}</em>);
    } else if (seg.startsWith("`") && seg.endsWith("`")) {
      parts.push(<code key={idx} className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-red-600 font-mono text-sm rounded">{seg.slice(1, -1)}</code>);
    } else {
      parts.push(seg);
    }
  });

  return parts;
}
