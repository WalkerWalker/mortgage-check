/**
 * The pipeline: the nine stages of the process, in order.
 *
 * Kept free of any framework import so it can be called from a Next route
 * handler, a Worker, a test, or a CLI without changing.
 */

import { consistencyFindings } from "./consistency";
import { decide, missingDocuments } from "./decision";
import {
  extractWithClaude,
  extractWithPatterns,
  toRuleInput,
  type UploadedFile,
} from "./extract";
import { draftWithClaude } from "./kreditantrag";
import { draftFromTemplate } from "./kreditantrag-template";
import { assess, proposeFixes } from "./rules";
import type { AnalysisResult, ExtractedDossier } from "./types";

export interface AnalyzeOptions {
  apiKey?: string;
  /** Skip the model entirely and use the pattern parser. */
  forceFallback?: boolean;
}

/**
 * Stages 3 to 8, given an extraction.
 *
 * Separated from extraction so the UI can re-run the whole assessment after a
 * human corrects a figure, without paying for a second read of the PDFs.
 */
export async function assessDossier(
  extracted: ExtractedDossier,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  // 3. Completeness check.
  const missing = missingDocuments(extracted);

  // 4. Consistency check.
  const findings = consistencyFindings(extracted);

  // 5 and 6. Equity and affordability, from the rule sheet.
  const input = toRuleInput(extracted);
  const assessment = assess(input);

  // 7. Decision proposal, with the changes that would make a failure pass.
  const fixes = proposeFixes(input);
  const decision = decide(extracted, assessment, findings, missing);

  // 8. Draft the Kreditantrag. A failure here must not sink the assessment,
  //    which is the part that actually matters, so fall back to the template.
  const draftInput = { dossier: extracted, assessment, findings, fixes, decision };
  let kreditantrag: string;
  let draftEngine: "claude" | "template-fallback";

  const canUseClaude = !options.forceFallback && Boolean(options.apiKey);
  if (canUseClaude) {
    try {
      kreditantrag = await draftWithClaude(draftInput, options.apiKey);
      draftEngine = "claude";
    } catch {
      kreditantrag = draftFromTemplate(draftInput);
      draftEngine = "template-fallback";
    }
  } else {
    kreditantrag = draftFromTemplate(draftInput);
    draftEngine = "template-fallback";
  }

  return {
    extracted,
    missingDocuments: missing,
    findings,
    assessment,
    fixes,
    decision,
    kreditantrag,
    draftEngine,
  };
}

/** The full run: read the PDFs, then assess them. */
export async function analyzeUpload(
  files: UploadedFile[],
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  if (files.length === 0) {
    throw new Error("No documents were uploaded.");
  }

  // 2. Extract. The model reads the PDFs; the pattern parser is the fallback.
  let extracted: ExtractedDossier;
  if (options.forceFallback || !options.apiKey) {
    extracted = await extractWithPatterns(files);
  } else {
    try {
      extracted = await extractWithClaude(files, options.apiKey);
    } catch (err) {
      // A failed read is worth reporting, but a working fallback is worth more
      // than an error page in front of a credit officer.
      console.error("Claude extraction failed, falling back to patterns:", err);
      extracted = await extractWithPatterns(files);
    }
  }

  return assessDossier(extracted, options);
}
