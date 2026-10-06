"use client";

/**
 * Stage 8: the drafted Kreditantrag.
 *
 * Rendered from markdown with a small purpose-built renderer rather than a
 * markdown dependency: the draft only ever uses headings, paragraphs, bold,
 * lists and pipe tables, and hand-rolling that subset keeps the credit proposal
 * styled like the rest of the page instead of like a README.
 */

import { useState } from "react";

export function KreditantragView({
  markdown,
  engine,
  onRedraft,
  busy,
}: {
  markdown: string;
  engine: "claude" | "template-fallback";
  onRedraft?: () => void;
  busy: boolean;
}) {
  const [showSource, setShowSource] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2">
          {engine === "claude" ? "drafted by claude-opus-5-5" : "template draft"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSource((s) => !s)}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 hover:bg-canvas hover:text-ink"
          >
            {showSource ? "Rendered" : "Markdown"}
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(markdown)}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 hover:bg-canvas hover:text-ink"
          >
            Copy
          </button>
          {onRedraft && (
            <button
              type="button"
              onClick={onRedraft}
              disabled={busy}
              className="rounded-md border border-line px-2 py-1 text-[12px] font-medium text-ink hover:bg-canvas disabled:opacity-45"
            >
              {busy ? "Drafting…" : "Redraft"}
            </button>
          )}
        </div>
      </div>

      {showSource ? (
        <pre className="mono max-h-[36rem] overflow-auto rounded-md bg-canvas p-4 text-[12px] leading-relaxed whitespace-pre-wrap">
          {markdown}
        </pre>
      ) : (
        <article>
          <Markdown source={markdown} />
        </article>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A markdown renderer for the subset the draft uses.
// ---------------------------------------------------------------------------

/** Bold spans, rendered inline. Nothing else is interpreted. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

const isSeparator = (line: string) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line);

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];

  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Headings
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const text = heading[2];
      if (depth === 1) {
        out.push(
          <h1
            key={key++}
            className="mb-3 text-[22px] leading-tight font-semibold text-ink"
          >
            {text}
          </h1>,
        );
      } else if (depth === 2) {
        out.push(
          <h2
            key={key++}
            className="mt-5 mb-2 border-b border-line pb-1 text-[12px] font-semibold tracking-wide text-ink uppercase"
          >
            {text}
          </h2>,
        );
      } else {
        out.push(
          <h3 key={key++} className="mt-4 mb-1 text-[14px] font-semibold text-ink">
            {text}
          </h3>,
        );
      }
      i++;
      continue;
    }

    // Tables: a header row, a separator, then body rows.
    if (line.trim().startsWith("|") && isSeparator(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }

      // The template emits a two-column key/value table with an empty header,
      // which should render as a plain definition list, not a headed table.
      const headless = header.every((h) => h === "");

      out.push(
        <table key={key++} className="my-3 w-full text-[13px]">
          {!headless && (
            <thead>
              <tr className="border-b border-line">
                {header.map((h, j) => (
                  <th
                    key={j}
                    className={`py-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase ${
                      j === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-line">
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td
                    key={ci}
                    className={`py-1.5 ${
                      ci === 0
                        ? "pr-4 text-ink-2"
                        : "tnum text-right text-ink"
                    }`}
                  >
                    <Inline text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // Bullet lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 space-y-1">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2 text-[14px] leading-relaxed text-ink-2">
              <span aria-hidden className="mt-[2px] text-ink-3">
                —
              </span>
              <span>
                <Inline text={it} />
              </span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph: gather until a blank line or a block starts.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("|")
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="my-2 text-[14px] leading-relaxed text-ink-2">
        <Inline text={para.join(" ")} />
      </p>,
    );
  }

  return <>{out}</>;
}
