"use client";

/**
 * "What would make this work."
 *
 * Each figure is solved in closed form and then re-run through the rule engine
 * before being shown, so the panel only ever offers changes the engine confirms
 * would flip every check to pass. Anything it could not verify says so rather
 * than being quietly dropped.
 */

import type { Fix } from "@/lib/types";

const KIND: Record<Fix["kind"], { label: string; icon: string }> = {
  "more-equity": { label: "Put more down", icon: "↑" },
  "lower-price": { label: "Buy cheaper", icon: "↓" },
  "more-income": { label: "Buy together", icon: "+" },
};

export function FixesPanel({ fixes }: { fixes: Fix[] }) {
  if (fixes.length === 0) return null;

  return (
    <section>
      <h2 className="display text-[22px] text-ink">Any one of these would work</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        Each option is checked against the rules before being suggested.
      </p>

      <ul className="mt-4 space-y-2">
        {fixes.map((f) => (
          <li
            key={f.kind}
            className="flex gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5 transition lift hover:border-ink-3"
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-[13px] font-semibold text-ink-2"
            >
              {KIND[f.kind].icon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-semibold text-ink">{f.label}</span>
                {!f.verified && (
                  <span className="text-[11px] text-ink-3">(not verified)</span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{f.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
