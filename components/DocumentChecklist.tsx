"use client";

/**
 * The seven documents, ticked off as they arrive.
 *
 * This is the completeness check (stage 3) shown before the dossier is sent
 * rather than after: the buyer finds out they are missing their pension
 * statement while they can still go and fetch it, instead of after waiting for
 * an analysis. Classification is by filename and runs in the browser, so the
 * list ticks the instant a file is dropped.
 */

import { classifyFilename } from "@/lib/documents";
import { REQUIRED_DOCUMENTS, type DocumentKey } from "@/lib/types";

/** Plain-English names. The German is what the bank will call them. */
const PLAIN: Record<DocumentKey, string> = {
  hypothekarantrag: "Mortgage application form",
  lohnausweis: "Salary certificate",
  steuererklaerung: "Tax return summary",
  betreibungsregister: "Debt register extract",
  vorsorgeausweis: "Pension fund statement",
  vermoegensausweis: "Bank statement of assets",
  verkaufsdokumentation: "Property sales documentation",
};

export function DocumentChecklist({ files }: { files: File[] }) {
  // First file wins a slot, so a duplicate cannot tick two rows.
  const matched = new Map<DocumentKey, string>();
  const unmatched: string[] = [];

  for (const f of files) {
    const key = classifyFilename(f.name);
    if (key && !matched.has(key)) matched.set(key, f.name);
    else unmatched.push(f.name);
  }

  const found = matched.size;
  const total = REQUIRED_DOCUMENTS.length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink">
          {files.length === 0 ? "What you will need" : "Your documents"}
        </h2>
        {files.length > 0 && (
          <span className="tnum text-[12px] text-ink-2">
            {found} of {total}
          </span>
        )}
      </div>

      {/* Two columns while it is just a list of what to gather; one column
          once files are attached, so each row has room for its filename. */}
      <ul
        className={`mt-3 ${
          files.length === 0 ? "grid gap-x-6 gap-y-px sm:grid-cols-2" : "space-y-px"
        }`}
      >
        {REQUIRED_DOCUMENTS.map((d) => {
          const file = matched.get(d.key);
          return (
            <li
              key={d.key}
              className="flex items-center gap-2.5 rounded-md px-1 py-[5px] transition-colors"
              style={file ? { background: "var(--color-accent-soft)" } : undefined}
            >
              <Tick on={Boolean(file)} />
              <span
                className={`flex-1 truncate text-[13px] ${
                  file ? "text-ink" : "text-ink-3"
                }`}
              >
                {PLAIN[d.key]}
                {files.length > 0 && <span className="text-ink-3"> · {d.label}</span>}
              </span>
              {file && (
                <span className="mono hidden max-w-[11rem] truncate text-[11px] text-ink-3 sm:block">
                  {file}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {unmatched.length > 0 && (
        <p className="mt-2.5 text-[12px] text-ink-3">
          {unmatched.length} file{unmatched.length === 1 ? "" : "s"} could not be
          matched to a document type and will be read anyway:{" "}
          <span className="mono">{unmatched.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

/**
 * A tick, or an empty slot.
 *
 * Never colour alone: present is a filled mark with a checkmark glyph inside,
 * absent is an open ring, so the two differ in shape as well as in hue.
 */
function Tick({ on }: { on: boolean }) {
  if (!on) {
    return (
      <span
        aria-hidden
        className="h-[17px] w-[17px] shrink-0 rounded-full border border-dashed border-line"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-bold text-white"
      style={{ background: "var(--color-good)" }}
    >
      ✓
    </span>
  );
}
