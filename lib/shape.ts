/**
 * The flat shape both extraction engines produce, and the function that folds
 * it into the nested dossier the rest of the app consumes.
 *
 * Shared so that the Claude path and the pattern path cannot drift apart: if
 * they both satisfy `FlatExtraction`, they are interchangeable, which is what
 * makes it meaningful to compare one against the other.
 */

import type { DocumentKey, ExtractedDossier, Sourced } from "./types";

export interface FlatSourced {
  value: number;
  document: string;
  label: string;
}

export interface FlatExtraction {
  applicantName: string;
  dateOfBirth: string;
  address: string;
  maritalStatus: string;
  employer: string;

  propertyDescription: string;
  propertyAddress: string;
  priceOnApplication: FlatSourced;
  priceOnSalesDoc: FlatSourced;

  statedIncome: FlatSourced;
  grossOnLohnausweis: FlatSourced;
  netOnLohnausweis: FlatSourced;
  netOnTaxReturn: FlatSourced;
  insuredSalary: FlatSourced;

  bankAccountsOnApplication: FlatSourced;
  securitiesOnApplication: FlatSourced;
  pensionWithdrawalOnApplication: FlatSourced;
  equityTotalOnApplication: FlatSourced;
  accountsOnBankStatement: FlatSourced;
  securitiesOnBankStatement: FlatSourced;
  totalOnBankStatement: FlatSourced;
  bankAssetsOnTaxReturn: FlatSourced;
  securitiesOnTaxReturn: FlatSourced;
  debtsOnTaxReturn: FlatSourced;

  pensionAssets: FlatSourced;
  maxWefAvailable: FlatSourced;
  wefRequested: FlatSourced;
  wefAlreadyWithdrawn: FlatSourced;

  mortgageRequested: FlatSourced;
  obligationsPerYear: FlatSourced;

  debtRegisterHasEntries: boolean;
  debtRegisterEntries: {
    date: string;
    creditor: string;
    amount: number;
    status: string;
  }[];

  documentTypesPresent: DocumentKey[];
  /** Which document the debt register was read from. */
  debtRegisterDocument?: string;
}

const sourced = (v: FlatSourced): Sourced<number> => ({
  value: v.value,
  document: v.document,
  label: v.label,
});

export function shape(
  p: FlatExtraction,
  documentsPresent: DocumentKey[],
  engine: "claude" | "pattern-fallback",
): ExtractedDossier {
  return {
    applicantName: p.applicantName,
    dateOfBirth: p.dateOfBirth,
    address: p.address,
    maritalStatus: p.maritalStatus,
    employer: p.employer,

    property: {
      description: p.propertyDescription,
      address: p.propertyAddress,
      priceOnApplication: sourced(p.priceOnApplication),
      priceOnSalesDoc: sourced(p.priceOnSalesDoc),
    },

    income: {
      statedOnApplication: sourced(p.statedIncome),
      grossOnLohnausweis: sourced(p.grossOnLohnausweis),
      netOnLohnausweis: sourced(p.netOnLohnausweis),
      netOnTaxReturn: sourced(p.netOnTaxReturn),
      insuredSalaryOnPensionStatement: sourced(p.insuredSalary),
    },

    equity: {
      bankAccountsOnApplication: sourced(p.bankAccountsOnApplication),
      securitiesOnApplication: sourced(p.securitiesOnApplication),
      pensionWithdrawalOnApplication: sourced(p.pensionWithdrawalOnApplication),
      totalOnApplication: sourced(p.equityTotalOnApplication),
      totalOnBankStatement: sourced(p.totalOnBankStatement),
      accountsOnBankStatement: sourced(p.accountsOnBankStatement),
      securitiesOnBankStatement: sourced(p.securitiesOnBankStatement),
      bankAssetsOnTaxReturn: sourced(p.bankAssetsOnTaxReturn),
      securitiesOnTaxReturn: sourced(p.securitiesOnTaxReturn),
      debtsOnTaxReturn: sourced(p.debtsOnTaxReturn),
    },

    pension: {
      assets: sourced(p.pensionAssets),
      maxWefAvailable: sourced(p.maxWefAvailable),
      wefRequested: sourced(p.wefRequested),
      wefAlreadyWithdrawn: sourced(p.wefAlreadyWithdrawn),
    },

    debtRegister: {
      hasEntries: p.debtRegisterHasEntries,
      entries: p.debtRegisterEntries,
      document: p.debtRegisterDocument ?? "04_Betreibungsregisterauszug.pdf",
    },

    mortgageRequested: sourced(p.mortgageRequested),
    obligationsPerYear: sourced(p.obligationsPerYear),

    documentsPresent,
    engine,
  };
}

/**
 * Refuse an extraction that cannot possibly be right.
 *
 * A credit check that silently assesses a dossier it failed to read is the
 * worst outcome available: it produces a confident decision from nothing. The
 * three figures below are load-bearing for every check, so if any of them is
 * missing the read has failed and must say so rather than hand zeros to the
 * rule engine.
 */
export function assertPlausible(d: ExtractedDossier): void {
  const problems: string[] = [];

  const price = Math.max(
    d.property.priceOnApplication.value,
    d.property.priceOnSalesDoc.value,
  );
  if (price <= 0) problems.push("no purchase price");
  if (d.income.grossOnLohnausweis.value <= 0) problems.push("no gross salary");
  if (
    d.equity.totalOnBankStatement.value <= 0 &&
    d.pension.wefRequested.value <= 0
  ) {
    problems.push("no equity");
  }

  if (problems.length > 0) {
    throw new Error(
      `The documents could not be read reliably (${problems.join(", ")}). ` +
        `Refusing to assess rather than decide on incomplete figures.`,
    );
  }
}
