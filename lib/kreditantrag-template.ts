/**
 * The Kreditantrag, assembled locally.
 *
 * Pure: no SDK, no network. This is what the static build ships, and what the
 * server falls back to when a Claude draft fails — a missing credit proposal
 * would be worse than a templated one, since every figure in it comes from the
 * rule engine either way.
 */

import { fmt, pct } from "./rules";
import type { Assessment, Decision, ExtractedDossier, Finding, Fix } from "./types";

export interface DraftInput {
  dossier: ExtractedDossier;
  assessment: Assessment;
  findings: Finding[];
  fixes: Fix[];
  decision: Decision;
}

/**
 * The computed facts, laid out for the model as a briefing.
 *
 * Also the body of the template fallback's figures section, so the two drafts
 * quote identical numbers.
 */
export function factSheet({ dossier, assessment, decision }: DraftInput): string {
  const a = assessment;
  return [
    `Applicant: ${dossier.applicantName}, born ${dossier.dateOfBirth}, ${dossier.maritalStatus}`,
    `Address: ${dossier.address}`,
    `Employer: ${dossier.employer}`,
    `Property: ${dossier.property.description}, ${dossier.property.address}`,
    ``,
    `Purchase price: CHF ${fmt(a.purchasePrice)}`,
    `Equity total: CHF ${fmt(a.totalEquity)} (${pct(a.equityShare)} of price)`,
    `  of which own funds: CHF ${fmt(a.hardEquity)} (${pct(a.hardEquityShare)})`,
    `  of which pension fund withdrawal: CHF ${fmt(a.pensionEquity)}`,
    `Mortgage: CHF ${fmt(a.mortgage)} (loan to value ${pct(a.loanToValue)})`,
    `  first mortgage: CHF ${fmt(a.firstMortgage)} (no repayment required)`,
    `  second mortgage: CHF ${fmt(a.secondMortgage)} (repaid over 15 years)`,
    ``,
    `Documented gross income: CHF ${fmt(a.grossIncome)}`,
    `Imputed interest at 5%: CHF ${fmt(a.interest)} per year`,
    `Maintenance at 1%: CHF ${fmt(a.maintenance)} per year`,
    `Amortization: CHF ${fmt(a.amortization)} per year`,
    `Total yearly cost: CHF ${fmt(a.totalYearlyCost)}`,
    `Cost ratio: ${pct(a.costRatio)} of gross income (limit 33.3%)`,
    `Required gross income: CHF ${fmt(a.requiredGrossIncome)}`,
    ``,
    `Checks:`,
    ...a.checks.map((c) => `  ${c.status === "pass" ? "PASS" : "FAIL"} — ${c.label}: ${c.detail}`),
    ``,
    `Proposed decision: ${decision.headline}`,
    `Reason: ${decision.reason}`,
  ].join("\n");
}


/** The same document, assembled locally. Used when no API key is configured. */
export function draftFromTemplate(input: DraftInput): string {
  const { dossier: d, assessment: a, findings, fixes, decision } = input;

  const lines: string[] = [
    `# Kreditantrag`,
    ``,
    `**Recommendation: ${decision.headline}**`,
    ``,
    decision.reason,
    ``,
    `## Antragsteller`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Name | ${d.applicantName} |`,
    `| Date of birth | ${d.dateOfBirth} |`,
    `| Address | ${d.address} |`,
    `| Marital status | ${d.maritalStatus} |`,
    `| Employer | ${d.employer} |`,
    `| Documented gross income | CHF ${fmt(a.grossIncome)} |`,
    ``,
    `## Objekt`,
    ``,
    `${d.property.description}, ${d.property.address}. Purchase price CHF ${fmt(a.purchasePrice)}, owner-occupied.`,
    ``,
    `## Finanzierung`,
    ``,
    `| Item | CHF |`,
    `|---|---|`,
    `| Purchase price | ${fmt(a.purchasePrice)} |`,
    `| Equity, own funds | ${fmt(a.hardEquity)} |`,
    `| Equity, pension fund withdrawal | ${fmt(a.pensionEquity)} |`,
    `| **Equity total** | **${fmt(a.totalEquity)}** (${pct(a.equityShare)}) |`,
    `| Mortgage | ${fmt(a.mortgage)} |`,
    `| — first mortgage, no repayment | ${fmt(a.firstMortgage)} |`,
    `| — second mortgage, 15 years | ${fmt(a.secondMortgage)} |`,
    ``,
    `## Tragbarkeit`,
    ``,
    `| Item | CHF per year |`,
    `|---|---|`,
    `| Imputed interest, 5% on CHF ${fmt(a.mortgage)} | ${fmt(a.interest)} |`,
    `| Maintenance, 1% of CHF ${fmt(a.purchasePrice)} | ${fmt(a.maintenance)} |`,
    `| Amortization, CHF ${fmt(a.secondMortgage)} over 15 years | ${fmt(a.amortization)} |`,
    `| **Total** | **${fmt(a.totalYearlyCost)}** |`,
    ``,
    `Cost ratio ${pct(a.costRatio)} of documented gross income of CHF ${fmt(a.grossIncome)}, ` +
      `against a limit of one third. Required gross income CHF ${fmt(a.requiredGrossIncome)}.`,
    ``,
    `## Feststellungen`,
    ``,
  ];

  if (findings.length === 0) {
    lines.push(`The seven documents agree with each other. No discrepancies found.`);
  } else {
    for (const f of findings) {
      lines.push(`**${f.title}** (${f.severity})`);
      lines.push(``);
      lines.push(`${f.detail} Source documents: ${f.documents.join(", ")}.`);
      lines.push(``);
    }
  }

  lines.push(``, `## Antrag an den Kreditausschuss`, ``);

  if (decision.outcome === "approve") {
    lines.push(
      `Approve the mortgage of CHF ${fmt(a.mortgage)} as applied for. All three checks ` +
        `under the bank's rule sheet are met and the dossier is internally consistent.`,
    );
  } else if (decision.outcome === "approve-with-conditions") {
    lines.push(
      `Approve the mortgage of CHF ${fmt(a.mortgage)} subject to the conditions below.`,
      ``,
    );
    for (const c of decision.conditions) lines.push(`- ${c}`);
  } else if (decision.outcome === "incomplete") {
    lines.push(`Do not assess. The dossier is incomplete.`, ``);
    for (const c of decision.conditions) lines.push(`- ${c}`);
  } else {
    lines.push(
      `Reject the application as submitted.`,
      ``,
      decision.reason,
      ``,
      `The following changes would bring the application within the rule sheet:`,
      ``,
    );
    for (const f of fixes) lines.push(`- **${f.label}.** ${f.detail}`);
  }

  return lines.join("\n");
}
