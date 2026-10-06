/**
 * Shared types for the mortgage application check.
 *
 * Two layers, deliberately separated:
 *   - `Extracted*`  what the AI read out of the PDFs (may be wrong, is editable)
 *   - `Assessment`  what the deterministic rule engine computed (never AI)
 */

/** The seven documents a Swiss mortgage dossier must contain. */
export const REQUIRED_DOCUMENTS = [
  { key: "hypothekarantrag", label: "Hypothekarantrag", en: "application form" },
  { key: "lohnausweis", label: "Lohnausweis", en: "salary certificate" },
  { key: "steuererklaerung", label: "Steuererklärung", en: "tax return summary" },
  { key: "betreibungsregister", label: "Betreibungsregisterauszug", en: "debt enforcement register extract" },
  { key: "vorsorgeausweis", label: "Vorsorgeausweis", en: "pension fund statement" },
  { key: "vermoegensausweis", label: "Vermögensausweis", en: "bank statement of assets" },
  { key: "verkaufsdokumentation", label: "Verkaufsdokumentation", en: "property sales documentation" },
] as const;

export type DocumentKey = (typeof REQUIRED_DOCUMENTS)[number]["key"];

/**
 * A single number read out of a document, carrying where it came from.
 * Provenance is the point: it is what makes the consistency check auditable.
 */
export interface Sourced<T> {
  value: T;
  /** Which document this came from, e.g. "02_Lohnausweis_2025.pdf". */
  document: string;
  /** The label as printed on the document, e.g. "8. Bruttolohn total". */
  label: string;
}

export interface DebtRegisterEntry {
  date: string;
  creditor: string;
  amount: number;
  status: string;
}

/** Everything the AI extracts from the dossier. */
export interface ExtractedDossier {
  applicantName: string;
  dateOfBirth: string;
  address: string;
  maritalStatus: string;
  employer: string;

  property: {
    description: string;
    address: string;
    /** Price as written on the application form (01). */
    priceOnApplication: Sourced<number>;
    /** Price as written on the sales documentation (07). */
    priceOnSalesDoc: Sourced<number>;
    /** Bank's own valuation, when one exists. Full process only. */
    bankValuation?: Sourced<number>;
  };

  income: {
    /** Gross income the applicant claims on the form (01). */
    statedOnApplication: Sourced<number>;
    /** Gross salary documented on the Lohnausweis (02, line 8). Authoritative. */
    grossOnLohnausweis: Sourced<number>;
    netOnLohnausweis: Sourced<number>;
    netOnTaxReturn: Sourced<number>;
    insuredSalaryOnPensionStatement: Sourced<number>;
  };

  equity: {
    /** Bank and savings accounts per the application form (01). */
    bankAccountsOnApplication: Sourced<number>;
    securitiesOnApplication: Sourced<number>;
    pensionWithdrawalOnApplication: Sourced<number>;
    totalOnApplication: Sourced<number>;
    /** Totals per the bank's own statement of assets (06). Authoritative. */
    totalOnBankStatement: Sourced<number>;
    accountsOnBankStatement: Sourced<number>;
    securitiesOnBankStatement: Sourced<number>;
    /** Per the tax return (03). */
    bankAssetsOnTaxReturn: Sourced<number>;
    securitiesOnTaxReturn: Sourced<number>;
    debtsOnTaxReturn: Sourced<number>;
  };

  pension: {
    assets: Sourced<number>;
    maxWefAvailable: Sourced<number>;
    wefRequested: Sourced<number>;
    wefAlreadyWithdrawn: Sourced<number>;
  };

  debtRegister: {
    hasEntries: boolean;
    entries: DebtRegisterEntry[];
    document: string;
  };

  mortgageRequested: Sourced<number>;
  obligationsPerYear: Sourced<number>;

  /** Which of the seven document types were actually supplied. */
  documentsPresent: DocumentKey[];
  /** Which extraction engine produced this. */
  engine: "claude" | "pattern-fallback";
}

// ---------------------------------------------------------------------------
// Rule engine layer
// ---------------------------------------------------------------------------

/** The rule sheet. Given by the exercise; not researched, not inferred. */
export interface RuleSheet {
  /** Minimum equity as a share of the purchase price. */
  minEquity: number;
  /** Minimum equity not from the pension fund, as a share of the purchase price. */
  minHardEquity: number;
  /** Imputed interest rate (kalkulatorischer Zins) on the full mortgage. */
  imputedRate: number;
  /** Maintenance and running costs as a share of the purchase price per year. */
  maintenanceRate: number;
  /** First mortgage ceiling as a share of the property value. */
  firstMortgageShare: number;
  /** Years to repay the second mortgage. */
  amortizationYears: number;
  /** Maximum share of gross income the yearly costs may consume. */
  affordabilityLimit: number;
}

export const SWISS_RULES: RuleSheet = {
  minEquity: 0.2,
  minHardEquity: 0.1,
  imputedRate: 0.05,
  maintenanceRate: 0.01,
  firstMortgageShare: 2 / 3,
  amortizationYears: 15,
  affordabilityLimit: 1 / 3,
};

/** The numbers the rule engine needs. Nothing else. */
export interface RuleInput {
  purchasePrice: number;
  /** Bank valuation, when known. The engine calculates on the lower of the two. */
  bankValuation?: number;
  /** Gross yearly income actually documented (not merely claimed). */
  grossIncome: number;
  /** Equity that does not come from the pension fund. */
  hardEquity: number;
  /** Equity withdrawn from the pension fund (WEF-Vorbezug). */
  pensionEquity: number;
}

export type CheckStatus = "pass" | "fail";

export interface Check {
  id: "equity" | "hardEquity" | "affordability";
  label: string;
  status: CheckStatus;
  /** One-line statement of what was compared, with the numbers in it. */
  detail: string;
  actual: number;
  required: number;
}

/** The full computed picture. Every field here is arithmetic, never AI. */
export interface Assessment {
  purchasePrice: number;
  /** min(purchasePrice, bankValuation) */
  valuation: number;
  hardEquity: number;
  pensionEquity: number;
  totalEquity: number;
  equityShare: number;
  hardEquityShare: number;

  mortgage: number;
  loanToValue: number;
  firstMortgage: number;
  secondMortgage: number;

  interest: number;
  maintenance: number;
  amortization: number;
  totalYearlyCost: number;

  grossIncome: number;
  costRatio: number;
  requiredGrossIncome: number;

  checks: Check[];
  passed: boolean;
}

export interface Finding {
  severity: "high" | "medium";
  title: string;
  detail: string;
  /** The documents that disagree. */
  documents: string[];
}

export interface Fix {
  kind: "more-equity" | "lower-price" | "more-income";
  label: string;
  detail: string;
  /** The assessment after applying this change, proving it passes. */
  verified: boolean;
}

export type DecisionOutcome =
  | "approve"
  | "approve-with-conditions"
  | "reject"
  | "incomplete";

export interface Decision {
  outcome: DecisionOutcome;
  headline: string;
  reason: string;
  conditions: string[];
}

export interface AnalysisResult {
  extracted: ExtractedDossier;
  missingDocuments: { key: DocumentKey; label: string; en: string }[];
  findings: Finding[];
  assessment: Assessment;
  fixes: Fix[];
  decision: Decision;
  kreditantrag: string;
  /** Which engine drafted the Kreditantrag prose. */
  draftEngine: "claude" | "template-fallback";
}
