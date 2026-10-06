/**
 * Does the pattern parser actually read the PDFs correctly?
 *
 * The fixtures in `samples.ts` were transcribed from the documents by hand, so
 * they are ground truth. This test reads the real PDFs off disk and asserts the
 * parser reproduces every figure. Without it the fallback is a guess that
 * produces confident credit decisions from misread numbers.
 *
 * Run with: npm run test:extraction
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractWithPatterns, toRuleInput } from "./extract";
import { consistencyFindings } from "./consistency";
import { assess } from "./rules";
import { SAMPLE_DOSSIERS, type SampleKey } from "./samples";
import type { ExtractedDossier } from "./types";
import { after, type UploadedFile as Upload } from "./fallback";

const FOLDERS: Record<SampleKey, string> = {
  A1: "A1_Thomas_Meier",
  A2: "A2_Nicole_Baumgartner",
  A3: "A3_Daniel_Schmid",
};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${(err as Error).message.split("\n").join("\n       ")}`);
  }
}

async function load(key: SampleKey): Promise<Upload[]> {
  const dir = path.join(process.cwd(), "samples", FOLDERS[key]);
  const names = (await readdir(dir)).filter((n) => n.endsWith(".pdf")).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      bytes: new Uint8Array(await readFile(path.join(dir, name))),
    })),
  );
}

/** Every numeric figure in a dossier, flattened to label -> value. */
function figures(d: ExtractedDossier): Record<string, number> {
  return {
    "property.priceOnApplication": d.property.priceOnApplication.value,
    "property.priceOnSalesDoc": d.property.priceOnSalesDoc.value,
    "income.statedOnApplication": d.income.statedOnApplication.value,
    "income.grossOnLohnausweis": d.income.grossOnLohnausweis.value,
    "income.netOnLohnausweis": d.income.netOnLohnausweis.value,
    "income.netOnTaxReturn": d.income.netOnTaxReturn.value,
    "income.insuredSalary": d.income.insuredSalaryOnPensionStatement.value,
    "equity.bankAccountsOnApplication": d.equity.bankAccountsOnApplication.value,
    "equity.securitiesOnApplication": d.equity.securitiesOnApplication.value,
    "equity.pensionWithdrawalOnApplication": d.equity.pensionWithdrawalOnApplication.value,
    "equity.totalOnApplication": d.equity.totalOnApplication.value,
    "equity.totalOnBankStatement": d.equity.totalOnBankStatement.value,
    "equity.accountsOnBankStatement": d.equity.accountsOnBankStatement.value,
    "equity.securitiesOnBankStatement": d.equity.securitiesOnBankStatement.value,
    "equity.bankAssetsOnTaxReturn": d.equity.bankAssetsOnTaxReturn.value,
    "equity.securitiesOnTaxReturn": d.equity.securitiesOnTaxReturn.value,
    "equity.debtsOnTaxReturn": d.equity.debtsOnTaxReturn.value,
    "pension.assets": d.pension.assets.value,
    "pension.maxWefAvailable": d.pension.maxWefAvailable.value,
    "pension.wefRequested": d.pension.wefRequested.value,
    "pension.wefAlreadyWithdrawn": d.pension.wefAlreadyWithdrawn.value,
    mortgageRequested: d.mortgageRequested.value,
    obligationsPerYear: d.obligationsPerYear.value,
  };
}

async function main() {
for (const key of ["A1", "A2", "A3"] as const) {
  const expected = SAMPLE_DOSSIERS[key];
  const files = await load(key);

  console.log(`\nPattern extraction — ${key} (${expected.applicantName})`);

  test(`reads all 7 documents`, () => {
    assert.equal(files.length, 7);
  });

  let actual: ExtractedDossier;
  try {
    actual = await extractWithPatterns(files);
  } catch (err) {
    failed++;
    console.log(`  FAIL extraction threw: ${(err as Error).message}`);
    continue;
  }

  test(`identifies all 7 document types`, () => {
    assert.equal(
      actual.documentsPresent.length,
      7,
      `got: ${actual.documentsPresent.join(", ")}`,
    );
  });

  test(`reads the applicant's name`, () => {
    assert.equal(actual.applicantName, expected.applicantName);
  });

  test(`reads the date of birth`, () => {
    assert.equal(actual.dateOfBirth, expected.dateOfBirth);
  });

  test(`reads the employer`, () => {
    assert.equal(actual.employer, expected.employer);
  });

  // Every figure, compared against the hand transcription.
  const want = figures(expected);
  const got = figures(actual);
  for (const field of Object.keys(want)) {
    test(`${field} = ${want[field]}`, () => {
      assert.equal(got[field], want[field]);
    });
  }

  test(`debt register: ${expected.debtRegister.entries.length} entries`, () => {
    assert.equal(actual.debtRegister.hasEntries, expected.debtRegister.hasEntries);
    assert.equal(
      actual.debtRegister.entries.length,
      expected.debtRegister.entries.length,
      JSON.stringify(actual.debtRegister.entries),
    );
  });

  if (expected.debtRegister.entries.length > 0) {
    test(`debt register entry matches`, () => {
      const a = actual.debtRegister.entries[0];
      const e = expected.debtRegister.entries[0];
      assert.equal(a.date, e.date);
      assert.equal(a.creditor, e.creditor);
      assert.equal(a.amount, e.amount);
      assert.equal(a.status, e.status);
    });
  }

  // The figures are only worth anything if they produce the same decision.
  test(`produces the same rule inputs as the fixture`, () => {
    assert.deepEqual(toRuleInput(actual), toRuleInput(expected));
  });

  test(`produces the same verdict as the fixture`, () => {
    const fromPdf = assess(toRuleInput(actual));
    const fromFixture = assess(toRuleInput(expected));
    assert.equal(fromPdf.passed, fromFixture.passed);
    assert.equal(fromPdf.costRatio.toFixed(4), fromFixture.costRatio.toFixed(4));
  });

  test(`finds the same consistency findings as the fixture`, () => {
    const fromPdf = consistencyFindings(actual).map((f) => f.title).sort();
    const fromFixture = consistencyFindings(expected).map((f) => f.title).sort();
    assert.deepEqual(fromPdf, fromFixture, `from PDFs: ${JSON.stringify(fromPdf)}`);
  });

  // Every figure must name the file it came from, or the provenance display and
  // the consistency check's "which two documents" are both meaningless.
  test(`every figure names a real source document`, () => {
    const names = new Set(files.map((f) => f.name));
    const unsourced: string[] = [];
    const check = (label: string, doc: string) => {
      if (!names.has(doc)) unsourced.push(`${label} -> ${doc}`);
    };
    check("priceOnApplication", actual.property.priceOnApplication.document);
    check("grossOnLohnausweis", actual.income.grossOnLohnausweis.document);
    check("totalOnBankStatement", actual.equity.totalOnBankStatement.document);
    check("wefRequested", actual.pension.wefRequested.document);
    check("debtRegister", actual.debtRegister.document);
    assert.deepEqual(unsourced, []);
  });
}

// ---------------------------------------------------------------------------
console.log(`\nRefusing an unreadable dossier`);
// ---------------------------------------------------------------------------

{
  // A dossier whose figures could not be read must raise rather than hand
  // zeros to the rule engine and produce a confident rejection.
  const blank: Upload[] = [
    { name: "01_Hypothekarantrag.pdf", bytes: new Uint8Array([37, 80, 68, 70]) },
  ];

  let threw = false;
  try {
    await extractWithPatterns(blank);
  } catch {
    threw = true;
  }
  test("throws on a dossier it cannot read", () => {
    assert.equal(threw, true);
  });
}

// ---------------------------------------------------------------------------
console.log(`\nAmount matching — never silently wrong`);
// ---------------------------------------------------------------------------
{
  // A miss is recoverable: assertPlausible turns it into a refusal. A wrong
  // number is not, because every check downstream trusts it. These cases all
  // once returned a plausible-looking wrong value, so they are pinned.
  const WANT = 900_000;
  const mustMatch: [string, string][] = [
    ["apostrophe grouping, as printed", "Kaufpreis CHF 900'000.00"],
    ["curly apostrophe", "Kaufpreis CHF 900’000.00"],
    ["space grouping", "Kaufpreis CHF 900 000.00"],
    ["comma grouping", "Kaufpreis CHF 900,000.00"],
    ["no decimals", "Kaufpreis CHF 900'000"],
    ["no currency marker", "Kaufpreis 900'000.00"],
    ["value on the next line", "Kaufpreis\nCHF 900'000.00"],
    ["a note between label and value", "Kaufpreis\n(gemäss Vertrag)\nCHF 900'000.00"],
    [
      "a sentence between label and value",
      "Kaufpreis gemäss dem am 14. März unterzeichneten Kaufvertrag zwischen den Parteien CHF 900'000.00",
    ],
  ];

  for (const [what, text] of mustMatch) {
    test(`reads 900,000 from: ${what}`, () => {
      assert.equal(after(text, /Kaufpreis/), WANT);
    });
  }

  // A date must never be mistaken for an amount.
  test("does not read a date as an amount", () => {
    assert.equal(after("Altersguthaben per 01.01.2026 CHF 310'500.00", /Altersguthaben/), 310_500);
  });

  // Where the label is absent the answer must be null, not a guess.
  const mustMiss: [string, string][] = [
    ["a different word for the same thing", "Erwerbspreis CHF 900'000.00"],
    ["a label in another language", "Prix d'achat CHF 900'000.00"],
    ["no extractable text, as from a scan", ""],
  ];
  for (const [what, text] of mustMiss) {
    test(`returns null rather than a guess: ${what}`, () => {
      assert.equal(after(text, /Kaufpreis/), null);
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
}

void main();
