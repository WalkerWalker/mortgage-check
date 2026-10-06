"use client";

/**
 * Stage 1: receive the application.
 *
 * Dropped files are staged rather than submitted, so the checklist can tick
 * through and the buyer sees what is still missing before anything is read.
 * The sample dossiers go straight through — they are known-complete, and a
 * demo should not need two clicks.
 */

import { useRef, useState } from "react";
import { DocumentChecklist } from "./DocumentChecklist";

const SAMPLES = [
  { id: "A1", name: "Thomas Meier", hint: "Uster · CHF 900,000" },
  { id: "A2", name: "Nicole Baumgartner", hint: "Wetzikon · CHF 1,100,000" },
  { id: "A3", name: "Daniel Schmid", hint: "Horgen · CHF 1,250,000" },
] as const;

export function Dropzone({
  onFiles,
  onSample,
  busy,
  stage,
}: {
  onFiles: (files: File[]) => void;
  onSample: (id: string) => void;
  busy: boolean;
  stage: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) return;
    // Add to what is already staged, so a dossier can arrive in two drops.
    setStaged((prev) => {
      const seen = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !seen.has(f.name))];
    });
  };

  if (busy) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-8 py-16 text-center lift">
        <p className="text-[15px] text-ink">{stage ?? "Working…"}</p>
        <div className="mx-auto mt-5 h-[3px] w-44 overflow-hidden rounded-full bg-sunken">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      </div>
    );
  }

  const empty = staged.length === 0;

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Upload your PDF documents"
        className={`group cursor-pointer rounded-2xl border border-dashed text-center transition-all duration-200 ${
          dragging
            ? "border-accent bg-accent-soft"
            : "border-line bg-surface hover:border-ink-3 hover:bg-canvas/40"
        } ${empty ? "px-8 py-14" : "px-8 py-8"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => accept(e.target.files)}
        />

        <span
          aria-hidden
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-[17px] text-ink-2 transition-transform duration-200 group-hover:-translate-y-0.5"
        >
          ↑
        </span>
        <p className="text-[15px] font-medium text-ink">
          {empty ? "Drop your documents here" : "Add more documents"}
        </p>
        <p className="mt-1 text-[13px] text-ink-3">
          PDFs, up to seven of them
        </p>
      </div>

      <DocumentChecklist files={staged} />

      {!empty && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onFiles(staged)}
            className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-90"
          >
            Check my mortgage
          </button>
          <button
            type="button"
            onClick={() => setStaged([])}
            className="text-[13px] text-ink-2 transition hover:text-ink"
          >
            Start over
          </button>
        </div>
      )}

      {empty && (
        <div className="border-t border-line pt-5">
          <p className="text-[12px] text-ink-3">
            No documents to hand? Try a sample buyer.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSample(s.id)}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-left text-[13px] transition hover:border-ink-3 hover:bg-canvas"
              >
                <span className="font-medium text-ink">{s.name}</span>
                <span className="tnum text-ink-3"> · {s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
