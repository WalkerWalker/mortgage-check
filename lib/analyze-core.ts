/**
 * Stages 3 to 8, with no dependency on the Anthropic SDK.
 *
 * Split out from `analyze.ts` so the browser can run the whole check without
 * pulling the SDK into the client bundle. Everything here is either pure
 * arithmetic or the templated Kreditantrag, which means the static build on
 * GitHub Pages does the full deterministic pipeline locally and the uploaded
 * PDFs never leave the machine.
 */

import { consistencyFindings } from "./consistency";
import { decide, missingDocuments } from "./decision";
import { toRuleInput } from "./rule-input";
import { draftFromTemplate } from "./kreditantrag-template";
import { assess, proposeFixes } from "./rules";
import type { AnalysisResult, ExtractedDossier } from "./types";

/**
 * Run the checks over an extraction.
 *
 * Returns everything but the Claude-drafted prose: callers that have an API key
 * replace `kreditantrag` afterwards.
 */
export function assessCore(extracted: ExtractedDossier): AnalysisResult {
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

  // 8. The Kreditantrag, assembled locally.
  const kreditantrag = draftFromTemplate({
    dossier: extracted,
    assessment,
    findings,
    fixes,
    decision,
  });

  return {
    extracted,
    missingDocuments: missing,
    findings,
    assessment,
    fixes,
    decision,
    kreditantrag,
    draftEngine: "template-fallback",
  };
}
