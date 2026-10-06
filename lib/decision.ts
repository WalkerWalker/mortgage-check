/**
 * Turning the checks into a proposed decision.
 *
 * A proposal, not a decision: the credit officer signs off. The wording here is
 * deterministic so that the same dossier always yields the same recommendation
 * and the same stated reason.
 */

import { fmt, pct } from "./rules";
import type {
  Assessment,
  Decision,
  DocumentKey,
  ExtractedDossier,
  Finding,
} from "./types";
import { REQUIRED_DOCUMENTS } from "./types";

export function missingDocuments(d: ExtractedDossier) {
  const present = new Set<DocumentKey>(d.documentsPresent);
  return REQUIRED_DOCUMENTS.filter((r) => !present.has(r.key)).map((r) => ({
    key: r.key,
    label: r.label,
    en: r.en,
  }));
}

export function decide(
  dossier: ExtractedDossier,
  assessment: Assessment,
  findings: Finding[],
  missing: { label: string; en: string }[],
): Decision {
  // Step 3 of the process: an incomplete dossier is not assessed, it is
  // returned to the applicant.
  if (missing.length > 0) {
    return {
      outcome: "incomplete",
      headline: "Documents missing",
      reason:
        `${missing.length} of ${REQUIRED_DOCUMENTS.length} required documents are ` +
        `missing: ${missing.map((m) => m.label).join(", ")}. ` +
        `The application cannot be assessed until they are supplied.`,
      conditions: missing.map((m) => `Request ${m.label} (${m.en}) from the applicant`),
    };
  }

  const failing = assessment.checks.filter((c) => c.status === "fail");

  if (failing.length > 0) {
    const equityFail = failing.find((c) => c.id === "equity");
    const hardFail = failing.find((c) => c.id === "hardEquity");
    const affordFail = failing.find((c) => c.id === "affordability");

    // Name the binding constraint rather than listing everything that failed:
    // the officer needs to know which single thing killed the application.
    let reason: string;
    if (affordFail && !equityFail && !hardFail) {
      reason =
        `Affordability is not met. Yearly costs of CHF ` +
        `${fmt(assessment.totalYearlyCost)} are ${pct(assessment.costRatio)} of the ` +
        `documented gross income of CHF ${fmt(assessment.grossIncome)}, above the ` +
        `one third limit. The application would need CHF ` +
        `${fmt(assessment.requiredGrossIncome)} of income.`;
    } else if (hardFail && !equityFail) {
      reason =
        `Hard equity is not met. Only CHF ${fmt(assessment.hardEquity)} of the ` +
        `CHF ${fmt(assessment.totalEquity)} equity comes from own funds, which is ` +
        `${pct(assessment.hardEquityShare)} of the purchase price against a minimum ` +
        `of 10%. The remaining CHF ${fmt(assessment.pensionEquity)} is a pension ` +
        `fund withdrawal and may not be counted towards it.`;
    } else if (equityFail) {
      reason =
        `Equity is not met. CHF ${fmt(assessment.totalEquity)} is ` +
        `${pct(assessment.equityShare)} of the purchase price, below the 20% minimum. ` +
        `At least CHF ${fmt(assessment.purchasePrice * 0.2)} is required.`;
    } else {
      reason = failing.map((c) => c.detail).join(" ");
    }

    return {
      outcome: "reject",
      headline:
        failing.length === 1
          ? `Reject — ${failing[0].label.replace(/ \(.*\)/, "")} not met`
          : "Reject — multiple checks not met",
      reason,
      conditions: [],
    };
  }

  // Everything passes. Findings do not block, but they become conditions the
  // officer must clear before release.
  const high = findings.filter((f) => f.severity === "high");
  if (findings.length > 0) {
    return {
      outcome: "approve-with-conditions",
      headline: "Approve with conditions",
      reason:
        `All three checks pass: equity ${pct(assessment.equityShare)}, hard equity ` +
        `${pct(assessment.hardEquityShare)}, affordability ${pct(assessment.costRatio)}. ` +
        `${findings.length} ${findings.length === 1 ? "discrepancy" : "discrepancies"} ` +
        `between the documents ${findings.length === 1 ? "needs" : "need"} clearing first` +
        (high.length > 0 ? `, ${high.length} of them material` : "") +
        `.`,
      conditions: findings.map((f) => `Clarify: ${f.title}`),
    };
  }

  return {
    outcome: "approve",
    headline: "Approve",
    reason:
      `All three checks pass and the documents agree. Equity ` +
      `${pct(assessment.equityShare)} of the purchase price, all of it own funds; ` +
      `yearly costs of CHF ${fmt(assessment.totalYearlyCost)} are ` +
      `${pct(assessment.costRatio)} of gross income, within the one third limit.`,
    conditions: [],
  };
}
