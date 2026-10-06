/**
 * Which document wins when the documents disagree.
 *
 * These choices are the substance of the credit check, so they are stated
 * explicitly rather than buried:
 *
 *   income  the employer's Lohnausweis, never the applicant's own claim. An
 *           expected bonus is not documented income.
 *   equity  the bank's own statement of assets, not the figure on the form.
 *   pension the pension fund's record of the withdrawal, capped at what the
 *           fund says is actually available.
 *   price   the higher of application and sales documentation, which is the
 *           conservative reading of the bank's exposure.
 *
 * In its own module, free of any dependency, so the browser can map an
 * extraction onto the rule engine without loading the Anthropic SDK.
 */

import type { ExtractedDossier, RuleInput } from "./types";

export function toRuleInput(d: ExtractedDossier): RuleInput {
  const purchasePrice = Math.max(
    d.property.priceOnApplication.value,
    d.property.priceOnSalesDoc.value,
  );

  const pensionEquity = Math.min(
    d.pension.wefRequested.value,
    d.pension.maxWefAvailable.value,
  );

  return {
    purchasePrice,
    bankValuation: d.property.bankValuation?.value,
    grossIncome: d.income.grossOnLohnausweis.value,
    hardEquity: d.equity.totalOnBankStatement.value,
    pensionEquity,
  };
}
