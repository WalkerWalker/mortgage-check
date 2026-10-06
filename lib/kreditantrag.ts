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
import { factSheet, type DraftInput } from "./kreditantrag-template";

const MODEL = "claude-opus-5-5";

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
