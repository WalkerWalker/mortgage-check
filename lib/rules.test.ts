/**
 * Tests for the rule engine.
 *
 * The first block is the exercise's worked example: these are the figures the
 * app must reproduce exactly, so they are asserted on the rounded francs the
 * rule sheet prints rather than on raw floats.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { assess, chf, proposeFixes } from "./rules";
import { consistencyFindings } from "./consistency";
import { SAMPLE_DOSSIERS } from "./samples";
import { decide } from "./decision";
import { toRuleInput } from "./extract";

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

function section(name: string) {
  console.log(`\n${name}`);
}

// ---------------------------------------------------------------------------
section("Worked example — CHF 1,000,000 purchase price");
// ---------------------------------------------------------------------------

{
  // 20% equity, none of it from the pension fund, as in the rule sheet's table.
  const worked = assess({
    purchasePrice: 1_000_000,
    grossIncome: 176_667, // not given by the sheet; irrelevant to these rows
    hardEquity: 200_000,
    pensionEquity: 0,
  });

  test("purchase price 1,000,000", () => {
    assert.equal(chf(worked.purchasePrice), 1_000_000);
  });
  test("equity (20%) = 200,000", () => {
    assert.equal(chf(worked.totalEquity), 200_000);
    assert.equal(chf(worked.equityShare * 100), 20);
  });
  test("mortgage (80%) = 800,000", () => {
    assert.equal(chf(worked.mortgage), 800_000);
  });
  test("second mortgage (800,000 - 666,667) = 133,333", () => {
    assert.equal(chf(worked.secondMortgage), 133_333);
  });
  test("interest 5% x 800,000 = 40,000 per year", () => {
    assert.equal(chf(worked.interest), 40_000);
  });
  test("maintenance 1% x 1,000,000 = 10,000 per year", () => {
    assert.equal(chf(worked.maintenance), 10_000);
  });
  test("amortization 133,333 / 15 = 8,889 per year", () => {
    assert.equal(chf(worked.amortization), 8_889);
  });
  test("total yearly cost = 58,889", () => {
    assert.equal(chf(worked.totalYearlyCost), 58_889);
  });
  test("required gross income (x 3) = 176,667", () => {
    assert.equal(chf(worked.requiredGrossIncome), 176_667);
  });
}

// ---------------------------------------------------------------------------
section("Applicant 1 — Thomas Meier (expected: pass)");
// ---------------------------------------------------------------------------

{
  const dossier = SAMPLE_DOSSIERS.A1;
  const a = assess(toRuleInput(dossier));

  test("cost ratio is about 30.7% (self-check in the exercise)", () => {
    assert.equal((a.costRatio * 100).toFixed(1), "30.7");
  });
  test("all three checks pass", () => {
    assert.equal(a.passed, true, JSON.stringify(a.checks, null, 2));
  });
  test("uses the documented salary of 165,000", () => {
    assert.equal(chf(a.grossIncome), 165_000);
  });
  test("total yearly cost = 50,667", () => {
    assert.equal(chf(a.totalYearlyCost), 50_667);
  });
  test("no consistency findings", () => {
    const findings = consistencyFindings(dossier);
    assert.equal(findings.length, 0, JSON.stringify(findings, null, 2));
  });
  test("decision is approve", () => {
    const d = decide(dossier, a, consistencyFindings(dossier), []);
    assert.equal(d.outcome, "approve");
  });
  test("no fixes offered, because nothing failed", () => {
    assert.equal(proposeFixes(toRuleInput(dossier)).length, 0);
  });
}

// ---------------------------------------------------------------------------
section("Applicant 2 — Nicole Baumgartner (expected: fail on hard equity)");
// ---------------------------------------------------------------------------

{
  const dossier = SAMPLE_DOSSIERS.A2;
  const input = toRuleInput(dossier);
  const a = assess(input);

  test("total equity passes at 20.9%", () => {
    const equity = a.checks.find((c) => c.id === "equity")!;
    assert.equal(equity.status, "pass");
    assert.equal((a.equityShare * 100).toFixed(1), "20.9");
  });
  test("hard equity fails at 6.4%", () => {
    const hard = a.checks.find((c) => c.id === "hardEquity")!;
    assert.equal(hard.status, "fail");
    assert.equal((a.hardEquityShare * 100).toFixed(1), "6.4");
  });
  test("affordability itself passes at 24.5%", () => {
    const aff = a.checks.find((c) => c.id === "affordability")!;
    assert.equal(aff.status, "pass");
    assert.equal((a.costRatio * 100).toFixed(1), "24.5");
  });
  test("overall fails", () => {
    assert.equal(a.passed, false);
  });
  test("the only failing check is hard equity", () => {
    const failing = a.checks.filter((c) => c.status === "fail").map((c) => c.id);
    assert.deepEqual(failing, ["hardEquity"]);
  });
  test("no consistency findings", () => {
    const findings = consistencyFindings(dossier);
    assert.equal(findings.length, 0, JSON.stringify(findings, null, 2));
  });
  test("decision is reject", () => {
    const d = decide(dossier, a, consistencyFindings(dossier), []);
    assert.equal(d.outcome, "reject");
  });

  const fixes = proposeFixes(input);
  test("at least one fix is offered", () => {
    assert.ok(fixes.length > 0);
  });
  test("every fix offered is verified to pass", () => {
    for (const f of fixes) {
      assert.equal(f.verified, true, `unverified fix: ${f.label}`);
    }
  });
  test("the equity fix asks for 40,000 more hard equity", () => {
    const fix = fixes.find((f) => f.kind === "more-equity");
    assert.ok(fix, "expected a more-equity fix");
    assert.match(fix!.label, /40'000|40,000/);
  });
  test("no co-borrower fix, because affordability was not the problem", () => {
    assert.equal(fixes.some((f) => f.kind === "more-income"), false);
  });
}

// ---------------------------------------------------------------------------
section("Applicant 3 — Daniel Schmid (expected: fail on affordability)");
// ---------------------------------------------------------------------------

{
  const dossier = SAMPLE_DOSSIERS.A3;
  const input = toRuleInput(dossier);
  const a = assess(input);

  test("engine uses the documented 175,000, not the claimed 190,000", () => {
    assert.equal(chf(a.grossIncome), 175_000);
  });
  test("equity passes at 22.4%", () => {
    assert.equal(a.checks.find((c) => c.id === "equity")!.status, "pass");
    assert.equal((a.equityShare * 100).toFixed(1), "22.4");
  });
  test("affordability fails at 40.1%", () => {
    assert.equal(a.checks.find((c) => c.id === "affordability")!.status, "fail");
    assert.equal((a.costRatio * 100).toFixed(1), "40.1");
  });
  test("total yearly cost = 70,111", () => {
    assert.equal(chf(a.totalYearlyCost), 70_111);
  });
  test("required gross income = 210,333", () => {
    assert.equal(chf(a.requiredGrossIncome), 210_333);
  });
  test("overall fails", () => {
    assert.equal(a.passed, false);
  });
  test("still fails even on the claimed income of 190,000", () => {
    const optimistic = assess({ ...input, grossIncome: 190_000 });
    assert.equal(optimistic.passed, false);
  });

  // This is the exercise's second self-check: exactly two findings, for this
  // applicant only.
  const findings = consistencyFindings(dossier);
  test("consistency check finds exactly 2 findings", () => {
    assert.equal(findings.length, 2, JSON.stringify(findings, null, 2));
  });
  test("one finding is the overstated income", () => {
    assert.ok(findings.some((f) => /income|Einkommen|salary/i.test(f.title)));
  });
  test("one finding is the debt register entry", () => {
    assert.ok(findings.some((f) => /Betreibung|debt/i.test(f.title)));
  });
  test("decision is reject", () => {
    const d = decide(dossier, a, findings, []);
    assert.equal(d.outcome, "reject");
  });

  const fixes = proposeFixes(input);
  test("every fix offered is verified to pass", () => {
    for (const f of fixes) {
      assert.equal(f.verified, true, `unverified fix: ${f.label}`);
    }
  });
  test("all three kinds of fix are offered", () => {
    const kinds = fixes.map((f) => f.kind).sort();
    assert.deepEqual(kinds, ["lower-price", "more-equity", "more-income"]);
  });
  test("equity fix asks for about 101,000 more", () => {
    const fix = fixes.find((f) => f.kind === "more-equity")!;
    assert.match(fix.label, /101'0|101,0/);
  });
  test("price fix caps the price at about 1,106,700", () => {
    const fix = fixes.find((f) => f.kind === "lower-price")!;
    assert.match(fix.label, /1'106'7|1,106,7/);
  });
  test("income fix asks for about 35,400 more", () => {
    const fix = fixes.find((f) => f.kind === "more-income")!;
    assert.match(fix.label, /35'4|35,4/);
  });
}

// ---------------------------------------------------------------------------
section("Acceptance criterion — one pass, two fails");
// ---------------------------------------------------------------------------

{
  const results = (["A1", "A2", "A3"] as const).map((k) => {
    const d = SAMPLE_DOSSIERS[k];
    return { k, passed: assess(toRuleInput(d)).passed };
  });

  test("exactly one applicant passes", () => {
    assert.equal(results.filter((r) => r.passed).length, 1);
  });
  test("exactly two applicants fail", () => {
    assert.equal(results.filter((r) => !r.passed).length, 2);
  });
  test("the one that passes is applicant 1", () => {
    assert.equal(results.find((r) => r.passed)!.k, "A1");
  });
  test("exactly one applicant has consistency findings", () => {
    const withFindings = (["A1", "A2", "A3"] as const).filter(
      (k) => consistencyFindings(SAMPLE_DOSSIERS[k]).length > 0,
    );
    assert.deepEqual(withFindings, ["A3"]);
  });
}

// ---------------------------------------------------------------------------
section("Rule engine edge cases");
// ---------------------------------------------------------------------------

{
  test("no second mortgage when the loan is within two thirds of value", () => {
    const a = assess({
      purchasePrice: 1_000_000,
      grossIncome: 300_000,
      hardEquity: 400_000,
      pensionEquity: 0,
    });
    assert.equal(chf(a.secondMortgage), 0);
    assert.equal(chf(a.amortization), 0);
    assert.equal(chf(a.mortgage), 600_000);
  });

  test("calculates on the bank valuation when it is below the price", () => {
    const a = assess({
      purchasePrice: 1_000_000,
      bankValuation: 900_000,
      grossIncome: 200_000,
      hardEquity: 200_000,
      pensionEquity: 0,
    });
    // Mortgage is still 800,000, but the first-mortgage cap drops to 600,000,
    // so the second mortgage grows and amortization rises with it.
    assert.equal(chf(a.valuation), 900_000);
    assert.equal(chf(a.secondMortgage), 200_000);
    assert.equal(chf(a.amortization), 13_333);
  });

  test("pension money alone cannot satisfy the hard equity rule", () => {
    const a = assess({
      purchasePrice: 1_000_000,
      grossIncome: 400_000,
      hardEquity: 0,
      pensionEquity: 300_000,
    });
    assert.equal(a.checks.find((c) => c.id === "equity")!.status, "pass");
    assert.equal(a.checks.find((c) => c.id === "hardEquity")!.status, "fail");
  });

  test("exactly 20% equity and 10% hard equity passes", () => {
    const a = assess({
      purchasePrice: 1_000_000,
      grossIncome: 300_000,
      hardEquity: 100_000,
      pensionEquity: 100_000,
    });
    assert.equal(a.checks.find((c) => c.id === "equity")!.status, "pass");
    assert.equal(a.checks.find((c) => c.id === "hardEquity")!.status, "pass");
  });

  test("a cost ratio of exactly one third passes", () => {
    // 58,889 total cost at 176,667 income is the worked example's own boundary.
    const a = assess({
      purchasePrice: 1_000_000,
      grossIncome: 176_666.67,
      hardEquity: 200_000,
      pensionEquity: 0,
    });
    assert.equal(a.checks.find((c) => c.id === "affordability")!.status, "pass");
  });

  test("fixes are offered for an applicant failing on income alone", () => {
    const fixes = proposeFixes({
      purchasePrice: 1_000_000,
      grossIncome: 100_000,
      hardEquity: 200_000,
      pensionEquity: 0,
    });
    assert.ok(fixes.length > 0);
    for (const f of fixes) assert.equal(f.verified, true, f.label);
  });
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
