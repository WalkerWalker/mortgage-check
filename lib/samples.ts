/**
 * The three sample dossiers, transcribed from the exercise's PDFs.
 *
 * These are reference extractions: what a correct read of the seven documents
 * produces. They serve two purposes — they let the rule engine be tested
 * without burning API calls, and they give the UI a demo path that works with
 * no API key configured.
 *
 * Numbers here are transcribed by hand from the PDFs and must not be "fixed" to
 * make a test pass. Applicant 3's income really does disagree across his
 * documents; that is the point of the exercise.
 */

import type { DebtRegisterEntry, DocumentKey, ExtractedDossier, Sourced } from "./types";

const DOC = {
  antrag: "01_Hypothekarantrag.pdf",
  lohn: "02_Lohnausweis_2025.pdf",
  steuer: "03_Steuererklaerung_2025_Zusammenfassung.pdf",
  betreibung: "04_Betreibungsregisterauszug.pdf",
  vorsorge: "05_Vorsorgeausweis.pdf",
  vermoegen: "06_Vermoegensausweis_Bank.pdf",
  verkauf: "07_Verkaufsdokumentation.pdf",
} as const;

const ALL_DOCS: DocumentKey[] = [
  "hypothekarantrag",
  "lohnausweis",
  "steuererklaerung",
  "betreibungsregister",
  "vorsorgeausweis",
  "vermoegensausweis",
  "verkaufsdokumentation",
];

/** Build a sourced value: the number, the file it came from, the printed label. */
function s<T>(value: T, document: string, label: string): Sourced<T> {
  return { value, document, label };
}

function dossier(args: {
  name: string;
  dateOfBirth: string;
  address: string;
  maritalStatus: string;
  employer: string;
  propertyDescription: string;
  propertyAddress: string;
  price: number;
  priceSalesDoc?: number;
  statedIncome: number;
  statedIncomeLabel?: string;
  grossSalary: number;
  netSalary: number;
  netOnTaxReturn: number;
  insuredSalary: number;
  bankAccounts: number;
  securities: number;
  wefOnApplication: number;
  equityTotal: number;
  statementAccounts: number;
  statementSecurities: number;
  taxBankAssets: number;
  taxSecurities: number;
  taxDebts: number;
  pensionAssets: number;
  maxWef: number;
  wefRequested: number;
  mortgageRequested: number;
  debtEntries?: DebtRegisterEntry[];
}): ExtractedDossier {
  return {
    applicantName: args.name,
    dateOfBirth: args.dateOfBirth,
    address: args.address,
    maritalStatus: args.maritalStatus,
    employer: args.employer,

    property: {
      description: args.propertyDescription,
      address: args.propertyAddress,
      priceOnApplication: s(args.price, DOC.antrag, "Kaufpreis"),
      priceOnSalesDoc: s(args.priceSalesDoc ?? args.price, DOC.verkauf, "Verkaufspreis"),
    },

    income: {
      statedOnApplication: s(
        args.statedIncome,
        DOC.antrag,
        args.statedIncomeLabel ?? "Bruttojahreseinkommen gemäss Angabe",
      ),
      grossOnLohnausweis: s(args.grossSalary, DOC.lohn, "8. Bruttolohn total"),
      netOnLohnausweis: s(args.netSalary, DOC.lohn, "11. Nettolohn"),
      netOnTaxReturn: s(args.netOnTaxReturn, DOC.steuer, "Nettolohn Haupterwerb"),
      insuredSalaryOnPensionStatement: s(
        args.insuredSalary,
        DOC.vorsorge,
        "Versicherter Lohn",
      ),
    },

    equity: {
      bankAccountsOnApplication: s(
        args.bankAccounts,
        DOC.antrag,
        "Bank- und Sparkonten",
      ),
      securitiesOnApplication: s(args.securities, DOC.antrag, "Wertschriften"),
      pensionWithdrawalOnApplication: s(
        args.wefOnApplication,
        DOC.antrag,
        "Vorbezug Pensionskasse (WEF)",
      ),
      totalOnApplication: s(args.equityTotal, DOC.antrag, "Total Eigenmittel"),
      totalOnBankStatement: s(
        args.statementAccounts + args.statementSecurities,
        DOC.vermoegen,
        "Total",
      ),
      accountsOnBankStatement: s(
        args.statementAccounts,
        DOC.vermoegen,
        "Privatkonto + Sparkonto",
      ),
      securitiesOnBankStatement: s(
        args.statementSecurities,
        DOC.vermoegen,
        "Wertschriftendepot (Kurswert)",
      ),
      bankAssetsOnTaxReturn: s(args.taxBankAssets, DOC.steuer, "Bankguthaben"),
      securitiesOnTaxReturn: s(args.taxSecurities, DOC.steuer, "Wertschriften"),
      debtsOnTaxReturn: s(args.taxDebts, DOC.steuer, "Schulden"),
    },

    pension: {
      assets: s(args.pensionAssets, DOC.vorsorge, "Altersguthaben per 01.01.2026"),
      maxWefAvailable: s(
        args.maxWef,
        DOC.vorsorge,
        "Maximal möglicher Vorbezug für Wohneigentum (WEF)",
      ),
      wefRequested: s(args.wefRequested, DOC.vorsorge, "Beantragter WEF-Vorbezug"),
      wefAlreadyWithdrawn: s(0, DOC.vorsorge, "Bereits bezogene WEF-Vorbezüge"),
    },

    debtRegister: {
      hasEntries: (args.debtEntries ?? []).length > 0,
      entries: args.debtEntries ?? [],
      document: DOC.betreibung,
    },

    mortgageRequested: s(args.mortgageRequested, DOC.antrag, "Beantragte Hypothek"),
    obligationsPerYear: s(0, DOC.antrag, "Leasing- und Kreditverpflichtungen"),

    documentsPresent: [...ALL_DOCS],
    engine: "pattern-fallback",
  };
}

/** Applicant 1. Everything agrees; passes on both equity and affordability. */
const A1 = dossier({
  name: "Thomas Meier",
  dateOfBirth: "11.05.1988",
  address: "Seestrasse 14, 8610 Uster",
  maritalStatus: "ledig",
  employer: "Helvetic Data AG, Zürich",
  propertyDescription: "4.5-Zimmer-Eigentumswohnung",
  propertyAddress: "Brunnenweg 3, 8610 Uster",
  price: 900_000,
  statedIncome: 165_000,
  grossSalary: 165_000,
  netSalary: 144_780.45,
  netOnTaxReturn: 144_780.45,
  insuredSalary: 138_540,
  bankAccounts: 140_000,
  securities: 60_000,
  wefOnApplication: 0,
  equityTotal: 200_000,
  statementAccounts: 140_000, // Privatkonto 21,000 + Sparkonto 119,000
  statementSecurities: 60_000,
  taxBankAssets: 140_000,
  taxSecurities: 60_000,
  taxDebts: 0,
  pensionAssets: 121_400,
  maxWef: 121_400,
  wefRequested: 0,
  mortgageRequested: 700_000,
});

/**
 * Applicant 2. Equity reaches 20.9% of the price, but CHF 160,000 of it is a
 * pension fund withdrawal, leaving only 6.4% hard equity against a 10% floor.
 * Her affordability is comfortable; the equity structure is what fails.
 */
const A2 = dossier({
  name: "Nicole Baumgartner",
  dateOfBirth: "27.01.1982",
  address: "Bahnhofstrasse 41, 8620 Wetzikon",
  maritalStatus: "ledig",
  employer: "Spital Zürcher Oberland AG",
  propertyDescription: "5.5-Zimmer-Einfamilienhaus",
  propertyAddress: "Lindenhof 9, 8623 Wetzikon",
  price: 1_100_000,
  statedIncome: 260_000,
  grossSalary: 260_000,
  netSalary: 228_807.95,
  netOnTaxReturn: 228_807.95,
  insuredSalary: 233_540,
  bankAccounts: 70_000,
  securities: 0,
  wefOnApplication: 160_000,
  equityTotal: 230_000,
  statementAccounts: 70_000, // Privatkonto 10,500 + Sparkonto 59,500
  statementSecurities: 0,
  taxBankAssets: 70_000,
  taxSecurities: 0,
  taxDebts: 0,
  pensionAssets: 310_500,
  maxWef: 310_500,
  wefRequested: 160_000,
  mortgageRequested: 870_000,
});

/**
 * Applicant 3. The dossier that disagrees with itself: the form claims
 * CHF 190,000 "incl. expected bonus" while the Lohnausweis documents
 * CHF 175,000 with a bonus of zero, and the debt register carries a settled
 * tax collection the form does not mention. On the documented income his
 * costs reach 40.1% and affordability fails.
 */
const A3 = dossier({
  name: "Daniel Schmid",
  dateOfBirth: "03.12.1984",
  address: "Dorfstrasse 77, 8810 Horgen",
  maritalStatus: "ledig",
  employer: "Medilab Diagnostics AG, Baar",
  propertyDescription: "5.5-Zimmer-Einfamilienhaus",
  propertyAddress: "Rebbergstrasse 22, 8810 Horgen",
  price: 1_250_000,
  statedIncome: 190_000,
  statedIncomeLabel: "Bruttojahreseinkommen gemäss Angabe (inkl. erwarteter Bonus)",
  grossSalary: 175_000,
  netSalary: 153_625.45,
  netOnTaxReturn: 153_625.45,
  insuredSalary: 148_540,
  bankAccounts: 180_000,
  securities: 100_000,
  wefOnApplication: 0,
  equityTotal: 280_000,
  statementAccounts: 180_000, // Privatkonto 27,000 + Sparkonto 153,000
  statementSecurities: 100_000,
  taxBankAssets: 180_000,
  taxSecurities: 100_000,
  taxDebts: 0,
  pensionAssets: 205_800,
  maxWef: 205_800,
  wefRequested: 0,
  mortgageRequested: 970_000,
  debtEntries: [
    {
      date: "12.03.2024",
      creditor: "Steueramt des Kantons Zürich",
      amount: 2_340,
      status: "Zahlungsbefehl zugestellt, Forderung am 02.05.2024 bezahlt",
    },
  ],
});

export const SAMPLE_DOSSIERS = { A1, A2, A3 } as const;

export type SampleKey = keyof typeof SAMPLE_DOSSIERS;

export const SAMPLE_LABELS: Record<SampleKey, string> = {
  A1: "A1 — Thomas Meier",
  A2: "A2 — Nicole Baumgartner",
  A3: "A3 — Daniel Schmid",
};
