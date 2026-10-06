/**
 * The consistency check: where do this applicant's seven documents disagree?
 *
 * These comparisons are deterministic rather than left to the model, for two
 * reasons. A mismatch is an exact arithmetic fact, so there is nothing to
 * interpret; and a credit officer needs the same dossier to produce the same
 * findings every time it is run.
 *
 * The model's job is upstream of this file: reading the numbers off seven PDFs
 * correctly. Once they are on the table, comparing them is arithmetic.
 */

import { fmt } from "./rules";
import type { ExtractedDossier, Finding, Sourced } from "./types";

/** Treat sub-franc gaps as agreement; they are rounding, not a discrepancy. */
const TOLERANCE = 1;

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > TOLERANCE;
}

function pair<T>(a: Sourced<T>, b: Sourced<T>): string[] {
  return [a.document, b.document];
}

export function consistencyFindings(d: ExtractedDossier): Finding[] {
  const findings: Finding[] = [];

  // 1. Income claimed on the form against income documented by the employer.
  //    This is the one that changes the decision, because the engine is only
  //    ever allowed to use the documented figure.
  const stated = d.income.statedOnApplication;
  const documented = d.income.grossOnLohnausweis;
  if (differs(stated.value, documented.value)) {
    const delta = stated.value - documented.value;
    findings.push({
      severity: "high",
      title: "Income on the application does not match the salary certificate",
      detail:
        `The application states CHF ${fmt(stated.value)} gross, the Lohnausweis ` +
        `documents CHF ${fmt(documented.value)} (${stated.label} vs ${documented.label}) — ` +
        `a difference of CHF ${fmt(Math.abs(delta))}. ` +
        (delta > 0
          ? `The assessment uses the documented CHF ${fmt(documented.value)}.`
          : `The assessment uses the documented CHF ${fmt(documented.value)}.`),
      documents: pair(stated, documented),
    });
  }

  // 2. Any entry in the debt enforcement register. Banks require this extract
  //    precisely to find these, so an entry is reportable even once settled.
  if (d.debtRegister.hasEntries) {
    const entries = d.debtRegister.entries;
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    findings.push({
      severity: entries.every((e) => /bezahlt|getilgt|paid/i.test(e.status))
        ? "medium"
        : "high",
      title: "Entry in the debt enforcement register (Betreibungsregister)",
      detail:
        `${entries.length} ${entries.length === 1 ? "entry" : "entries"} ` +
        `totalling CHF ${fmt(total)}: ` +
        entries
          .map((e) => `${e.date}, ${e.creditor}, CHF ${fmt(e.amount)} — ${e.status}`)
          .join("; ") +
        `. The application declares no obligations.`,
      documents: [d.debtRegister.document],
    });
  }

  // 3. Purchase price on the application against the sales documentation.
  const priceForm = d.property.priceOnApplication;
  const priceDoc = d.property.priceOnSalesDoc;
  if (differs(priceForm.value, priceDoc.value)) {
    findings.push({
      severity: "high",
      title: "Purchase price differs between the application and the sales documentation",
      detail:
        `The application states CHF ${fmt(priceForm.value)}, the sales ` +
        `documentation states CHF ${fmt(priceDoc.value)}. The assessment uses the ` +
        `higher figure of CHF ${fmt(Math.max(priceForm.value, priceDoc.value))}.`,
      documents: pair(priceForm, priceDoc),
    });
  }

  // 4. Liquid equity claimed on the form against the bank's own statement.
  const claimedLiquid =
    d.equity.bankAccountsOnApplication.value + d.equity.securitiesOnApplication.value;
  const statementTotal = d.equity.totalOnBankStatement;
  if (differs(claimedLiquid, statementTotal.value)) {
    findings.push({
      severity: "high",
      title: "Equity on the application does not match the bank statement of assets",
      detail:
        `The application claims CHF ${fmt(claimedLiquid)} in accounts and securities, ` +
        `the Vermögensausweis totals CHF ${fmt(statementTotal.value)} — a difference of ` +
        `CHF ${fmt(Math.abs(claimedLiquid - statementTotal.value))}. ` +
        `The assessment uses the bank's figure of CHF ${fmt(statementTotal.value)}.`,
      documents: [d.equity.bankAccountsOnApplication.document, statementTotal.document],
    });
  }

  // 5. Net salary on the tax return against the salary certificate.
  const netLohn = d.income.netOnLohnausweis;
  const netTax = d.income.netOnTaxReturn;
  if (differs(netLohn.value, netTax.value)) {
    findings.push({
      severity: "medium",
      title: "Net salary differs between the salary certificate and the tax return",
      detail:
        `The Lohnausweis shows CHF ${fmt(netLohn.value)} net, the tax return declares ` +
        `CHF ${fmt(netTax.value)} — a difference of CHF ` +
        `${fmt(Math.abs(netLohn.value - netTax.value))}.`,
      documents: pair(netLohn, netTax),
    });
  }

  // 6. Pension withdrawal requested on the form against the pension statement.
  const wefForm = d.equity.pensionWithdrawalOnApplication;
  const wefStatement = d.pension.wefRequested;
  if (differs(wefForm.value, wefStatement.value)) {
    findings.push({
      severity: "high",
      title: "Pension fund withdrawal differs between the application and the pension statement",
      detail:
        `The application plans a WEF withdrawal of CHF ${fmt(wefForm.value)}, the ` +
        `Vorsorgeausweis records CHF ${fmt(wefStatement.value)}.`,
      documents: pair(wefForm, wefStatement),
    });
  }

  // 7. A withdrawal larger than the pension fund allows.
  if (wefStatement.value - d.pension.maxWefAvailable.value > TOLERANCE) {
    findings.push({
      severity: "high",
      title: "Requested pension fund withdrawal exceeds the amount available",
      detail:
        `CHF ${fmt(wefStatement.value)} requested against a maximum of CHF ` +
        `${fmt(d.pension.maxWefAvailable.value)} available for home ownership.`,
      documents: [d.pension.maxWefAvailable.document],
    });
  }

  // 8. Does the equity total on the form add up to its own parts?
  const parts =
    d.equity.bankAccountsOnApplication.value +
    d.equity.securitiesOnApplication.value +
    d.equity.pensionWithdrawalOnApplication.value;
  if (differs(parts, d.equity.totalOnApplication.value)) {
    findings.push({
      severity: "medium",
      title: "Equity total on the application does not add up",
      detail:
        `The parts sum to CHF ${fmt(parts)} but the form totals CHF ` +
        `${fmt(d.equity.totalOnApplication.value)}.`,
      documents: [d.equity.totalOnApplication.document],
    });
  }

  // 9. Debts on the tax return while the form declares none.
  if (
    d.equity.debtsOnTaxReturn.value > TOLERANCE &&
    d.obligationsPerYear.value <= TOLERANCE
  ) {
    findings.push({
      severity: "high",
      title: "Tax return declares debts while the application declares none",
      detail:
        `The tax return lists CHF ${fmt(d.equity.debtsOnTaxReturn.value)} of debt; ` +
        `the application states no leasing or credit obligations.`,
      documents: [d.equity.debtsOnTaxReturn.document, d.obligationsPerYear.document],
    });
  }

  // 10. Does the requested mortgage match price minus equity?
  const impliedMortgage =
    d.property.priceOnApplication.value - d.equity.totalOnApplication.value;
  if (differs(impliedMortgage, d.mortgageRequested.value)) {
    findings.push({
      severity: "medium",
      title: "Requested mortgage does not match price minus equity",
      detail:
        `Price less equity is CHF ${fmt(impliedMortgage)}, but the application ` +
        `requests CHF ${fmt(d.mortgageRequested.value)}.`,
      documents: [d.mortgageRequested.document],
    });
  }

  return findings;
}
