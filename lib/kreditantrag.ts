/**
 * Step 8 of the process: draft the Kreditantrag (credit proposal).
 *
 * This is the one place the model writes prose rather than reading numbers, and
 * it is given every figure pre-computed. It is told not to recalculate
 * anything: the rule engine already decided, and a draft that quietly disagrees
 * with the checks above it would be worse than no draft.
 *
 * The template fallback produces the same document without an API call, so the
 * stretch goal still demos with no key configured.
 */

import Anthropic from "@anthropic-ai/sdk";
import { fmt, pct } from "./rules";
import type {
  Assessment,
  Decision,
  ExtractedDossier,
  Finding,
  Fix,
} from "./types";

const MODEL = "claude-opus-5-5";

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
function factSheet({ dossier, assessment, decision }: DraftInput): string {
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

const SYSTEM_PROMPT = `You write the Kreditantrag — the one-page credit proposal a Swiss mortgage \
advisor puts in front of a credit officer.

You are given the figures already calculated by the bank's rule engine. Use them exactly as given. Do \
not recalculate, re-derive, round differently, or introduce any number that is not in the briefing: the \
officer is reading your page alongside the engine's output, and a figure that disagrees makes the whole \
proposal untrustworthy.

Write it the way a Swiss bank writes it:

- Sober and factual. No sales language, no hedging, no filler.
- Lead with the recommendation and the single reason for it. The officer should know the answer from the \
first two lines.
- Structure: Antrag (what is being asked), Antragsteller (who), Objekt (what property), Finanzierung \
(the structure), Tragbarkeit (the affordability arithmetic), Feststellungen (findings from the document \
check, if any), Antrag an den Kreditausschuss (the recommendation, with conditions or with the reason \
for rejection).
- Headings in German, body text in English. This is a working document for an English-speaking credit \
committee at a Swiss bank, which is the convention these teams actually use.
- Where the rule engine rejected the application, state plainly what failed and by how much, then give \
the concrete changes that would make it pass, with their figures.
- Where there are discrepancies between the documents, report them under Feststellungen with the two \
documents named. Do not soften them.
- Plain markdown. No preamble, no closing remark, no offer to help. Produce only the document.
- Keep it to one page.`;

export async function draftWithClaude(
  input: DraftInput,
  apiKey?: string,
): Promise<string> {
  const client = new Anthropic(apiKey ? { apiKey } : {});

  const findingsBlock =
    input.findings.length > 0
      ? input.findings
          .map(
            (f) =>
              `- [${f.severity}] ${f.title}\n  ${f.detail}\n  Documents: ${f.documents.join(", ")}`,
          )
          .join("\n")
      : "None. The documents agree with each other.";

  const fixesBlock =
    input.fixes.length > 0
      ? input.fixes.map((f) => `- ${f.label}: ${f.detail}`).join("\n")
      : "Not applicable.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content:
          `Draft the Kreditantrag.\n\n` +
          `## Figures from the rule engine\n\n${factSheet(input)}\n\n` +
          `## Findings from the document consistency check\n\n${findingsBlock}\n\n` +
          `## Changes that would make it pass\n\n${fixesBlock}\n`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude returned an empty Kreditantrag draft.");
  return text;
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
