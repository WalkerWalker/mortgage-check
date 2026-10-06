"use client";

/**
 * The buyer's answer, and the dial that explains it.
 *
 * The three sliders are the only things a buyer can actually change: what they
 * pay for the place, how much of their own cash they put in, and how much they
 * take out of their pension. Everything else follows from the rule sheet.
 *
 * This runs the real engine, not an approximation of it: `rules.ts` is pure
 * TypeScript with no dependencies, so `assess` runs in the browser on every
 * tick and the slider cannot disagree with the formal decision.
 */

import { useMemo, useState } from "react";
import { assess, fmt, pct } from "@/lib/rules";
import type { RuleInput } from "@/lib/types";
import { StatusChip } from "./ui";

export function Simulator({
  documented,
  maxPension,
}: {
  /** The figures as read from the documents. The reset target. */
  documented: RuleInput;
  /** What the pension fund says is available for a withdrawal. */
  maxPension: number;
}) {
  const [price, setPrice] = useState(documented.purchasePrice);
  const [own, setOwn] = useState(documented.hardEquity);
  const [pension, setPension] = useState(documented.pensionEquity);

  const touched =
    price !== documented.purchasePrice ||
    own !== documented.hardEquity ||
    pension !== documented.pensionEquity;

  const input: RuleInput = {
    purchasePrice: price,
    bankValuation: documented.bankValuation,
    grossIncome: documented.grossIncome,
    hardEquity: own,
    pensionEquity: pension,
  };

  const a = useMemo(() => assess(input), [price, own, pension, documented.grossIncome]);

  const equity = own + pension;
  const mortgage = Math.max(0, price - equity);
  const overfunded = equity > price;

  // Step in thousands: fine enough to hit a threshold, coarse enough to drag.
  const step = 5_000;

  return (
    <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Try other numbers</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            Move a slider to see what it would take.
          </p>
        </div>
        {touched && (
          <button
            type="button"
            onClick={() => {
              setPrice(documented.purchasePrice);
              setOwn(documented.hardEquity);
              setPension(documented.pensionEquity);
            }}
            className="text-[12px] text-ink-2 underline decoration-line underline-offset-2 hover:text-ink"
          >
            Back to your documents
          </button>
        )}
      </div>

      {/* The verdict for whatever is currently on the dials. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-canvas px-4 py-3">
        <StatusChip status={a.passed ? "pass" : "fail"}>
          {a.passed ? "This works" : "Does not pass"}
        </StatusChip>
        <span className="text-[13px] text-ink-2">
          Mortgage <span className="tnum font-semibold text-ink">CHF {fmt(mortgage)}</span>
          {" · "}
          <span className="tnum font-semibold text-ink">
            CHF {fmt(a.totalYearlyCost / 12)}
          </span>{" "}
          a month
          {" · "}
          costs <span className="tnum font-semibold text-ink">{pct(a.costRatio)}</span> of
          income
        </span>
      </div>

      {/* Where the money comes from. */}
      <div className="mt-5">
        <SplitBar
          own={own}
          pension={pension}
          mortgage={mortgage}
          price={price}
          overfunded={overfunded}
        />
      </div>

      <div className="mt-6 space-y-5">
        <Slider
          label="Purchase price"
          value={price}
          onChange={setPrice}
          min={Math.max(100_000, Math.round((documented.purchasePrice * 0.5) / step) * step)}
          max={Math.round((documented.purchasePrice * 1.3) / step) * step}
          step={step}
          documented={documented.purchasePrice}
        />

        <Slider
          label="Your own cash"
          hint="Savings and securities. Not pension money."
          value={own}
          onChange={setOwn}
          min={0}
          max={Math.max(
            Math.round((documented.hardEquity * 2.5) / step) * step,
            Math.round((price * 0.4) / step) * step,
          )}
          step={step}
          documented={documented.hardEquity}
          threshold={{ at: price * 0.1, label: "10% minimum" }}
        />

        <Slider
          label="Pension fund withdrawal"
          hint={
            maxPension > 0
              ? `Up to CHF ${fmt(maxPension)} available. Does not count towards the 10%.`
              : "No pension withdrawal available."
          }
          value={pension}
          onChange={setPension}
          min={0}
          max={Math.max(step, Math.round(maxPension / step) * step)}
          step={step}
          documented={documented.pensionEquity}
          disabled={maxPension <= 0}
        />
      </div>

      {/* Why it does or does not work, in the buyer's terms. */}
      <ul className="mt-6 space-y-2 border-t border-line pt-4">
        {a.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5 text-[13px]">
            <span className="mt-[1px]">
              <StatusChip status={c.status}>{""}</StatusChip>
            </span>
            <span className="text-ink-2">{plainLanguage(c.id, a)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The rule sheet's checks, said the way a buyer would ask about them. */
function plainLanguage(
  id: "equity" | "hardEquity" | "affordability",
  a: ReturnType<typeof assess>,
): string {
  if (id === "equity") {
    return a.checks.find((c) => c.id === "equity")!.status === "pass"
      ? `Your down payment is ${pct(a.equityShare)} of the price — at least 20% is required.`
      : `Your down payment is only ${pct(a.equityShare)} of the price. You need 20%, which is CHF ${fmt(a.purchasePrice * 0.2)}.`;
  }
  if (id === "hardEquity") {
    return a.checks.find((c) => c.id === "hardEquity")!.status === "pass"
      ? `${pct(a.hardEquityShare)} of the price is your own cash — at least 10% must not come from your pension.`
      : `Only ${pct(a.hardEquityShare)} of the price is your own cash. At least 10% — CHF ${fmt(a.purchasePrice * 0.1)} — cannot come from your pension fund.`;
  }
  return a.checks.find((c) => c.id === "affordability")!.status === "pass"
    ? `Yearly costs of CHF ${fmt(a.totalYearlyCost)} are ${pct(a.costRatio)} of your income — the limit is one third.`
    : `Yearly costs of CHF ${fmt(a.totalYearlyCost)} are ${pct(a.costRatio)} of your income. The limit is one third, so this needs CHF ${fmt(a.requiredGrossIncome)} of income.`;
}

/**
 * Where the money comes from, as parts of one whole.
 *
 * A 2px surface gap separates the segments rather than a border, and each
 * segment is labelled directly beneath, so the three parts are identifiable
 * without relying on the colour steps.
 */
function SplitBar({
  own,
  pension,
  mortgage,
  price,
  overfunded,
}: {
  own: number;
  pension: number;
  mortgage: number;
  price: number;
  overfunded: boolean;
}) {
  const total = Math.max(price, own + pension);
  const w = (n: number) => `${(n / total) * 100}%`;

  const parts = [
    { key: "own", label: "Your cash", value: own, color: "var(--color-own)" },
    { key: "pension", label: "Pension", value: pension, color: "var(--color-pension)" },
    { key: "bank", label: "Mortgage", value: mortgage, color: "var(--color-bank)" },
  ].filter((p) => p.value > 0);

  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md">
        {parts.map((p) => (
          <div
            key={p.key}
            className="h-7 first:rounded-l-md last:rounded-r-md"
            style={{ width: w(p.value), background: p.color }}
            title={`${p.label}: CHF ${fmt(p.value)}`}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-baseline gap-1.5 text-[12px]">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm"
              style={{ background: p.color }}
            />
            <span className="text-ink-2">{p.label}</span>
            <span className="tnum font-semibold text-ink">CHF {fmt(p.value)}</span>
          </span>
        ))}
      </div>

      {overfunded && (
        <p className="mt-2 text-[12px] text-ink-3">
          Your down payment already covers the full price — no mortgage needed.
        </p>
      )}
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  documented,
  threshold,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  /** The figure read from the documents, marked on the track. */
  documented: number;
  /** A rule threshold worth marking, e.g. the 10% hard equity floor. */
  threshold?: { at: number; label: string };
  disabled?: boolean;
}) {
  const pctAt = (n: number) => Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100));

  /**
   * Place a marker label under the track without letting it hang off the edge:
   * centred in the middle of the range, but flush left or right at the ends.
   */
  const markerStyle = (n: number): React.CSSProperties => {
    const p = pctAt(n);
    if (p < 10) return { left: 0 };
    if (p > 90) return { right: 0 };
    return { left: `${p}%`, transform: "translateX(-50%)" };
  };

  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-[13px] font-medium text-ink">{label}</label>
        <span className="tnum text-[14px] font-semibold text-ink">CHF {fmt(value)}</span>
      </div>
      {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}

      <div className="relative mt-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[var(--color-accent)]"
          aria-label={label}
        />
        {/* Markers sit under the track: the documented figure, and any rule floor. */}
        <div
          className={`pointer-events-none relative mt-0.5 ${threshold ? "h-7" : "h-4"}`}
        >
          {threshold && threshold.at >= min && threshold.at <= max && (
            <span
              className="absolute text-[10px] whitespace-nowrap text-ink-3"
              style={markerStyle(threshold.at)}
            >
              ▲ {threshold.label}
            </span>
          )}
          {documented >= min && documented <= max && (
            <span
              className="absolute text-[10px] whitespace-nowrap text-ink-3"
              style={{ ...markerStyle(documented), top: threshold ? "0.85rem" : 0 }}
            >
              ▲ your documents
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
