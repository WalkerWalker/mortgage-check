/**
 * The small shared pieces.
 *
 * Two rules shape these. A status is never colour alone — every pass or fail
 * carries a coloured mark, an icon and a word, because the validated status
 * palette puts green and red only 4.1 ΔE apart under deuteranopia and `good` at
 * 3.27:1 on a light surface. And detail is disclosed, not dumped: the page
 * leads with the decision and lets the reader open the arithmetic if they want
 * to audit it.
 */

import type { ReactNode } from "react";

/** A titled block separated by air and a hairline, not boxed in. */
export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {note && <p className="mt-0.5 text-[13px] text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Detail the reader can open.
 *
 * A native `<details>` so it is keyboard accessible and searchable in-page
 * without any state of its own.
 */
export function Disclosure({
  summary,
  hint,
  defaultOpen = false,
  children,
}: {
  summary: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-3.5 hover:opacity-70">
        <span className="text-[14px] font-medium text-ink">{summary}</span>
        <span className="flex shrink-0 items-center gap-2 text-[12px] text-ink-3">
          {hint}
          <span
            aria-hidden
            className="inline-block transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </span>
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

/** Pass / fail chip: mark + icon + word. */
export function StatusChip({
  status,
  children,
}: {
  status: "pass" | "fail" | "warn";
  children?: ReactNode;
}) {
  const spec = {
    pass: { color: "var(--color-good)", icon: "✓", word: "Pass" },
    fail: { color: "var(--color-critical)", icon: "✕", word: "Fail" },
    warn: { color: "var(--color-warning)", icon: "!", word: "Note" },
  }[status];

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink">
      <span
        aria-hidden
        className="flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] leading-none font-bold text-white"
        style={{ background: spec.color }}
      >
        {spec.icon}
      </span>
      {children ?? spec.word}
    </span>
  );
}

/**
 * A single ratio against a limit.
 *
 * The right form for this job: a same-ramp track with the fill stepped dark on
 * a light track, the limit marked by a solid hairline, and the value labelled
 * directly. The data-end is rounded and anchored to the left baseline.
 */
export function Meter({
  value,
  limit,
  scaleMax,
  status,
}: {
  value: number;
  limit: number;
  scaleMax: number;
  status: "pass" | "fail";
}) {
  const pctOf = (n: number) => `${Math.min(100, (n / scaleMax) * 100)}%`;
  const fill = status === "pass" ? "var(--color-good)" : "var(--color-critical)";
  const track =
    status === "pass" ? "var(--color-good-track)" : "var(--color-critical-track)";

  return (
    <div className="relative h-1.5 w-full rounded-full" style={{ background: track }}>
      <div
        className="absolute top-0 left-0 h-1.5 rounded-full"
        style={{ width: pctOf(value), background: fill }}
      />
      <div
        aria-hidden
        className="absolute -top-1 h-3.5 w-[2px] rounded-full bg-ink"
        style={{ left: pctOf(limit) }}
      />
    </div>
  );
}

/** One figure, label above. */
export function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className="tnum mt-0.5 text-[19px] leading-tight font-semibold text-ink">
        {value}
      </div>
      {note && <div className="mt-0.5 text-[12px] text-ink-3">{note}</div>}
    </div>
  );
}

/** Where a figure came from: the file and the label printed next to it. */
export function Provenance({
  document,
  label,
}: {
  document: string;
  label: string;
}) {
  return (
    <span className="text-[11px] text-ink-3">
      <span className="mono">{document}</span>
      {label && <span> · {label}</span>}
    </span>
  );
}
