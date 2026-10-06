/**
 * Step 2 of the process: read the dossier.
 *
 * This is the only place the model touches the numbers, and it is deliberately
 * the only place: extraction is reading, which the model is good at, while the
 * decision is arithmetic, which belongs in `rules.ts`. Everything the model
 * returns carries the document and printed label it came from, so a human can
 * check any figure against its source — and so the consistency check can say
 * *which* two documents disagree.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { classifyFilename } from "./documents";
import { assertPlausible, shape, type FlatExtraction } from "./shape";
import type { DocumentKey, ExtractedDossier } from "./types";

export { classifyFilename };
export { toRuleInput } from "./rule-input";
export { extractWithPatterns } from "./fallback";
export type { UploadedFile } from "./fallback";

import type { UploadedFile } from "./fallback";

/** Opus 5.5 reads the seven PDFs natively; no PDF parsing library involved. */
const MODEL = "claude-opus-5-5";

// ---------------------------------------------------------------------------
// Claude extraction
// ---------------------------------------------------------------------------

const sourced = (what: string) =>
  z.object({
    value: z.number().describe(`${what}, in francs, as a plain number`),
    document: z.string().describe("exact filename this was read from"),
    label: z.string().describe("the label printed next to it on the document"),
  });

const ExtractionSchema = z.object({
  applicantName: z.string(),
  dateOfBirth: z.string().describe("as printed, e.g. 11.05.1988"),
  address: z.string(),
  maritalStatus: z.string(),
  employer: z.string(),

  propertyDescription: z.string(),
  propertyAddress: z.string(),
  priceOnApplication: sourced("purchase price on the application form"),
  priceOnSalesDoc: sourced("sale price on the sales documentation"),

  statedIncome: sourced("gross yearly income as claimed on the application form"),
  grossOnLohnausweis: sourced("gross salary total on the salary certificate"),
  netOnLohnausweis: sourced("net salary on the salary certificate"),
  netOnTaxReturn: sourced("net salary from main employment on the tax return"),
  insuredSalary: sourced("insured salary on the pension fund statement"),

  bankAccountsOnApplication: sourced("bank and savings accounts on the application"),
  securitiesOnApplication: sourced("securities on the application"),
  pensionWithdrawalOnApplication: sourced("WEF pension withdrawal on the application"),
  equityTotalOnApplication: sourced("total equity on the application"),
  accountsOnBankStatement: sourced("sum of account balances on the bank asset statement"),
  securitiesOnBankStatement: sourced("securities portfolio on the bank asset statement"),
  totalOnBankStatement: sourced("total on the bank asset statement"),
  bankAssetsOnTaxReturn: sourced("bank assets on the tax return"),
  securitiesOnTaxReturn: sourced("securities holding on the tax return, not the income from them"),
  debtsOnTaxReturn: sourced("debts on the tax return"),

  pensionAssets: sourced("retirement assets on the pension fund statement"),
  maxWefAvailable: sourced("maximum WEF withdrawal available for home ownership"),
  wefRequested: sourced("WEF withdrawal requested, per the pension fund statement"),
  wefAlreadyWithdrawn: sourced("WEF withdrawals already taken"),

  mortgageRequested: sourced("mortgage amount requested"),
  obligationsPerYear: sourced("yearly leasing and credit obligations"),

  debtRegisterHasEntries: z
    .boolean()
    .describe("true if the debt enforcement register extract lists any entry at all"),
  debtRegisterEntries: z.array(
    z.object({
      date: z.string(),
      creditor: z.string(),
      amount: z.number(),
      status: z.string().describe("status as printed, including whether it was paid"),
    }),
  ),

  documentTypesPresent: z
    .array(
      z.enum([
        "hypothekarantrag",
        "lohnausweis",
        "steuererklaerung",
        "betreibungsregister",
        "vorsorgeausweis",
        "vermoegensausweis",
        "verkaufsdokumentation",
      ]),
    )
    .describe("which of the seven required document types you were actually given"),
});

const SYSTEM_PROMPT = `You read Swiss mortgage application dossiers and transcribe the figures a credit \
check needs. You are the reading step of a larger process: a separate rule engine makes the decision, \
so your only job is to report what the documents say, accurately and with its source.

Rules you must follow:

- Report what each document actually says. Never reconcile, average, or correct a figure to make the \
documents agree. Discrepancies between documents are the most valuable thing you can surface, and a \
later step compares them; silently smoothing one over defeats the whole check.
- Swiss documents write thousands with an apostrophe: CHF 165'000.00 means 165000. Report plain numbers.
- For every figure, give the exact filename you read it from and the label printed next to it on the \
page, e.g. label "8. Bruttolohn total" from "02_Lohnausweis_2025.pdf". A credit officer will use these \
to find the number on the page.
- The salary certificate's gross total (Bruttolohn total, usually line 8) is the documented income. If \
the application form claims a different figure, report both as they stand.
- Do not confuse a holding with the income from it. On the tax return, "Wertschriften" is the value of \
the securities and "Wertschriftenertrag" is the dividend income; the holding is what the equity check \
needs.
- On the debt enforcement register extract: set debtRegisterHasEntries to true if any entry is listed, \
even one that has since been paid. A sentence stating that no entries are recorded ("keine Betreibungen \
verzeichnet") means false and an empty list.
- If a figure genuinely does not appear in any document, report 0 and say so in the label.`;

/**
 * Read a dossier with Claude, sending the PDFs as native document blocks.
 *
 * Sending the PDFs themselves rather than pre-extracted text means the model
 * sees the page layout, which is what lets it report a figure's printed label,
 * and means a scanned dossier would work the same way.
 */
export async function extractWithClaude(
  files: UploadedFile[],
  apiKey?: string,
): Promise<ExtractedDossier> {
  const client = new Anthropic(apiKey ? { apiKey } : {});

  const documentBlocks = files.map((f) => ({
    type: "document" as const,
    source: {
      type: "base64" as const,
      media_type: "application/pdf" as const,
      data: Buffer.from(f.bytes).toString("base64"),
    },
    title: f.name,
  }));

  const manifest = files.map((f) => `- ${f.name}`).join("\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(ExtractionSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          ...documentBlocks,
          {
            type: "text",
            text:
              `These ${files.length} files are one applicant's mortgage dossier:\n${manifest}\n\n` +
              `Transcribe the figures listed in the schema. Cite the filename and the printed ` +
              `label for each one. Where two documents state different values for the same ` +
              `thing, report each as it stands.`,
          },
        ],
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Claude returned no structured extraction for this dossier.");
  }

  // Trust filename classification where it is unambiguous, and fall back to
  // the model's own classification for anything it could not match.
  const fromFilenames = files
    .map((f) => classifyFilename(f.name))
    .filter((k): k is DocumentKey => k !== null);
  const present = [...new Set<DocumentKey>([...fromFilenames, ...parsed.documentTypesPresent])];

  const flat: FlatExtraction = {
    ...parsed,
    debtRegisterDocument:
      files.find((f) => classifyFilename(f.name) === "betreibungsregister")?.name ??
      "04_Betreibungsregisterauszug.pdf",
    documentTypesPresent: present,
  };

  const dossier = shape(flat, present, "claude");
  assertPlausible(dossier);
  return dossier;
}
