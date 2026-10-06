"use client";

/**
 * Stage 1: receive the application.
 *
 * The whole landing page is this one target. Drag the documents in, or load a
 * sample dossier — the sample buttons run the same pipeline over the real PDFs
 * on disk, so they are a shortcut for choosing files, not a way around the
 * extraction step.
 */

import { useRef, useState } from "react";

const SAMPLES = [
  { id: "A1", name: "Thomas Meier" },
  { id: "A2", name: "Nicole Baumgartner" },
  { id: "A3", name: "Daniel Schmid" },
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
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length > 0) onFiles(pdfs);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) accept(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click();
        }}
        aria-label="Upload the applicant's PDF documents"
        className={`cursor-pointer rounded-xl border border-dashed px-8 py-14 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-ink-3"
        } ${busy ? "pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => accept(e.target.files)}
        />

        {busy ? (
          <>
            <p className="text-[15px] text-ink">{stage ?? "Working…"}</p>
            <div className="mx-auto mt-4 h-[3px] w-48 overflow-hidden rounded-full bg-canvas">
              <div className="h-[3px] w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          </>
        ) : (
          <>
            <p className="text-[16px] font-medium text-ink">Drop the documents here</p>
            <p className="mt-1.5 text-[13px] text-ink-2">
              or click to choose files
            </p>
          </>
        )}
      </div>

      {!busy && (
        <p className="mt-5 text-center text-[13px] text-ink-3">
          No dossier to hand? Try{" "}
          {SAMPLES.map((s, i) => (
            <span key={s.id}>
              {i > 0 && (i === SAMPLES.length - 1 ? " or " : ", ")}
              <button
                type="button"
                onClick={() => onSample(s.id)}
                className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
              >
                {s.name}
              </button>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}
