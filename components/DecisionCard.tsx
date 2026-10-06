"use client";

/**
 * Stages 7 and 9: the proposal, and the officer's sign-off.
 *
 * The wording is a proposal, never a decision — the credit officer decides, and
 * the buttons at the bottom are where that happens. The outcome's colour is
 * paired with an icon and the word, since the status palette must never carry
 * meaning on its own.
 */

import type { Decision, DecisionOutcome } from "@/lib/types";

const SPEC: Record<
  DecisionOutcome,
  { color: string; icon: string; label: string }
> = {
  approve: { color: "var(--color-good)", icon: "✓", label: "Approve" },
  "approve-with-conditions": {
    color: "var(--color-warning)",
    icon: "!",
    label: "Approve with conditions",
  },
  reject: { color: "var(--color-critical)", icon: "✕", label: "Reject" },
  incomplete: {
    color: "var(--color-serious)",
    icon: "?",
    label: "Incomplete dossier",
  },
};

export function DecisionCard({
  decision,
  signedOff,
  onSignOff,
}: {
  decision: Decision;
  signedOff: "approved" | "rejected" | null;
  onSignOff: (outcome: "approved" | "rejected") => void;
}) {
  const spec = SPEC[decision.outcome];

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      {/* A 3px spine in the status colour, with the icon and word beside it. */}
      <div className="flex">
        <div aria-hidden className="w-[3px] shrink-0" style={{ background: spec.color }} />
        <div className="flex-1 px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: spec.color }}
            >
              {spec.icon}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                Proposed decision
              </div>
              <h2 className="text-[20px] leading-tight font-semibold text-ink">
                {decision.headline}
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
                {decision.reason}
              </p>

              {decision.conditions.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                    {decision.outcome === "incomplete" ? "Required" : "Conditions"}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {decision.conditions.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-ink">
                        <span aria-hidden className="text-ink-3">
                          —
                        </span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas px-5 py-3">
        <span className="text-[12px] text-ink-2">
          {signedOff
            ? `Signed off: ${signedOff === "approved" ? "approved" : "rejected"} by the credit officer.`
            : "A proposal. The credit officer decides."}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSignOff("rejected")}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-canvas"
            aria-pressed={signedOff === "rejected"}
          >
            {signedOff === "rejected" ? "✕ Rejected" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => onSignOff("approved")}
            className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
            aria-pressed={signedOff === "approved"}
          >
            {signedOff === "approved" ? "✓ Approved" : "Approve"}
          </button>
        </div>
      </footer>
    </section>
  );
}
