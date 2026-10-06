"use client";

/**
 * Stages 3 to 6: completeness, consistency, equity, affordability.
 *
 * Presented as three one-line verdicts with the arithmetic folded away behind
 * them. A credit officer skimming the page needs the verdicts; one auditing it
 * needs the sums, and can open them. Printing both at once was the thing that
 * made this unreadable.
 */

import { fmt, pct } from "@/lib/rules";
import { REQUIRED_DOCUMENTS } from "@/lib/types";
import type { AnalysisResult } from "@/lib/types";
import { Disclosure, Meter, StatusChip } from "./ui";

/** The three rule-sheet checks, each a row: name, meter, figure, verdict. */
export function ChecksSummary({ result }: { result: AnalysisResult }) {
  const a = result.assessment;
  const rows = [
    {
      check: a.checks.find((c) => c.id === "equity")!,
      value: a.equityShare,
      limit: 0.2,
      scaleMax: 0.35,
      caption: `CHF ${fmt(a.totalEquity)} of CHF ${fmt(a.purchasePrice)}`,
      limitText: "min 20%",
    },
    {
      check: a.checks.find((c) => c.id === "hardEquity")!,
      value: a.hardEquityShare,
      limit: 0.1,
      scaleMax: 0.35,
      caption:
        a.pensionEquity > 0
          ? `CHF ${fmt(a.hardEquity)} own funds; CHF ${fmt(a.pensionEquity)} is pension money`
          : `CHF ${fmt(a.hardEquity)}, all own funds`,
      limitText: "min 10%",
    },
    {
      check: a.checks.find((c) => c.id === "affordability")!,
      value: a.costRatio,
      limit: 1 / 3,
      scaleMax: 0.5,
      caption: `CHF ${fmt(a.totalYearlyCost)} of CHF ${fmt(a.grossIncome)} income`,
      limitText: "max 33.3%",
    },
  ];

  return (
    <div className="space-y-5">
      {rows.map((r) => (
        <div key={r.check.id} className="grid gap-x-5 gap-y-2 sm:grid-cols-[1fr_11rem]">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-ink">
                {r.check.label.replace(/ \(.*\)/, "")}
              </span>
              <span className="tnum text-[14px] font-semibold text-ink sm:hidden">
                {pct(r.value)}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-ink-3">{r.caption}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Meter
                value={r.value}
                limit={r.limit}
                scaleMax={r.scaleMax}
                status={r.check.status}
              />
              <div className="mt-1 flex justify-between text-[11px] text-ink-3">
                <span className="tnum font-semibold text-ink">{pct(r.value)}</span>
                <span>{r.limitText}</span>
              </div>
            </div>
            <StatusChip status={r.check.status}>{""}</StatusChip>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Where the seven documents disagree with each other. */
export function FindingsList({ result }: { result: AnalysisResult }) {
  const { findings } = result;

  if (findings.length === 0) {
    return (
      <p className="text-[13px] text-ink-2">
        The seven documents agree with each other. No discrepancies found.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {findings.map((f, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background:
                f.severity === "high" ? "var(--color-critical)" : "var(--color-warning)",
            }}
          />
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-ink">{f.title}</div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{f.detail}</p>
            <p className="mt-1 text-[11px] text-ink-3">
              {f.documents.map((d, j) => (
                <span key={j}>
                  {j > 0 && " ↔ "}
                  <span className="mono">{d}</span>
                </span>
              ))}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The sums behind the verdicts. */
export function Arithmetic({ result }: { result: AnalysisResult }) {
  const a = result.assessment;

  return (
    <div className="grid gap-7 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
          Financing
        </h3>
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-line">
            <Row label="Purchase price" value={a.purchasePrice} />
            {a.valuation < a.purchasePrice && (
              <Row label="Bank valuation (used)" value={a.valuation} />
            )}
            <Row label="Own funds" value={a.hardEquity} />
            <Row label="Pension fund withdrawal" value={a.pensionEquity} />
            <Row label="Equity total" value={a.totalEquity} strong />
            <Row label="Mortgage" value={a.mortgage} strong />
            <Row
              label={`First mortgage (≤ ⅔ of ${fmt(a.valuation)})`}
              value={a.firstMortgage}
            />
            <Row label="Second mortgage" value={a.secondMortgage} />
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
          Yearly cost
        </h3>
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-line">
            <Row label={`Interest, 5% of ${fmt(a.mortgage)}`} value={a.interest} />
            <Row
              label={`Maintenance, 1% of ${fmt(a.purchasePrice)}`}
              value={a.maintenance}
            />
            <Row
              label={
                a.secondMortgage > 0
                  ? `Amortization, ${fmt(a.secondMortgage)} ÷ 15`
                  : "Amortization (none)"
              }
              value={a.amortization}
            />
            <Row label="Total" value={a.totalYearlyCost} strong />
            <Row label="Documented gross income" value={a.grossIncome} />
            <Row label="Required gross income" value={a.requiredGrossIncome} />
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-ink-3">
          Cost ratio {pct(a.costRatio)} of gross income.
        </p>
      </div>
    </div>
  );
}

/** The document checklist. Only interesting when something is missing. */
export function Completeness({ result }: { result: AnalysisResult }) {
  const { missingDocuments: missing, extracted } = result;

  return (
    <div>
      {missing.length > 0 && (
        <p className="mb-3 text-[13px] text-ink">
          {missing.length} of {REQUIRED_DOCUMENTS.length} documents are missing. The
          application cannot be assessed until they are supplied.
        </p>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {REQUIRED_DOCUMENTS.map((d) => {
          const present = extracted.documentsPresent.includes(d.key);
          return (
            <li
              key={d.key}
              className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"
              title={d.en}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: present ? "var(--color-good)" : "var(--color-critical)",
                }}
              />
              {present ? d.label : <s>{d.label}</s>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Re-exported for the page to fold the arithmetic away. */
export function ArithmeticDisclosure({ result }: { result: AnalysisResult }) {
  return (
    <Disclosure summary="The arithmetic" hint="every figure behind the three checks">
      <Arithmetic result={result} />
    </Disclosure>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <tr>
      <td className={`py-1.5 pr-4 ${strong ? "font-semibold text-ink" : "text-ink-2"}`}>
        {label}
      </td>
      <td className={`tnum py-1.5 text-right ${strong ? "font-semibold" : ""}`}>
        {fmt(value)}
      </td>
    </tr>
  );
}
