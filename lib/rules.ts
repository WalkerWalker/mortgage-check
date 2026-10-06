/**
 * The rule engine.
 *
 * This file is the only place the mortgage decision is made, and it contains
 * no AI. The rule sheet decides the numbers; the model only reads documents and
 * drafts prose elsewhere. Everything here is pure arithmetic over a RuleInput,
 * which makes it testable against the worked example.
 *
 * Money is carried at full precision and rounded only for display, which is
 * what reproduces the worked example's figures exactly.
 */

import {
  type Assessment,
  type Check,
  type Fix,
  type RuleInput,
  type RuleSheet,
  SWISS_RULES,
} from "./types";

/** Round half-up to whole francs, for display only. */
export function chf(n: number): number {
  return Math.round(n);
}

/**
 * Apply the rule sheet to one applicant.
 *
 * The three checks are independent: an applicant can fail equity while passing
 * affordability, and the reasons must not be conflated when we report them.
 */
export function assess(input: RuleInput, rules: RuleSheet = SWISS_RULES): Assessment {
  const purchasePrice = input.purchasePrice;

  // The bank lends against the lower of price and its own valuation. With no
  // separate valuation the two coincide, which is the usual PoC case.
  const valuation = Math.min(
    purchasePrice,
    input.bankValuation ?? Number.POSITIVE_INFINITY,
  );

  const hardEquity = input.hardEquity;
  const pensionEquity = input.pensionEquity;
  const totalEquity = hardEquity + pensionEquity;

  // Equity requirements are measured against the purchase price: that is the
  // sum the buyer actually has to put on the table.
  const equityShare = totalEquity / purchasePrice;
  const hardEquityShare = hardEquity / purchasePrice;

  const mortgage = purchasePrice - totalEquity;
  const loanToValue = mortgage / valuation;

  // The first mortgage is capped at two thirds of the property value and needs
  // no repayment. Anything above that is the second mortgage and must be repaid.
  const firstMortgageCap = valuation * rules.firstMortgageShare;
  const firstMortgage = Math.min(mortgage, firstMortgageCap);
  const secondMortgage = Math.max(0, mortgage - firstMortgageCap);

  const interest = mortgage * rules.imputedRate;
  const maintenance = purchasePrice * rules.maintenanceRate;
  const amortization = secondMortgage / rules.amortizationYears;
  const totalYearlyCost = interest + maintenance + amortization;

  const grossIncome = input.grossIncome;
  const costRatio = totalYearlyCost / grossIncome;
  const requiredGrossIncome = totalYearlyCost / rules.affordabilityLimit;

  const checks: Check[] = [
    {
      id: "equity",
      label: "Equity (Eigenmittel)",
      status: equityShare >= rules.minEquity ? "pass" : "fail",
      detail:
        `CHF ${fmt(totalEquity)} of CHF ${fmt(purchasePrice)} = ` +
        `${pct(equityShare)} (minimum ${pct(rules.minEquity)})`,
      actual: equityShare,
      required: rules.minEquity,
    },
    {
      id: "hardEquity",
      label: "Hard equity (not from pension fund)",
      status: hardEquityShare >= rules.minHardEquity ? "pass" : "fail",
      detail:
        `CHF ${fmt(hardEquity)} of CHF ${fmt(purchasePrice)} = ` +
        `${pct(hardEquityShare)} (minimum ${pct(rules.minHardEquity)})` +
        (pensionEquity > 0
          ? `; CHF ${fmt(pensionEquity)} is a pension fund withdrawal and does not count`
          : ""),
      actual: hardEquityShare,
      required: rules.minHardEquity,
    },
    {
      id: "affordability",
      label: "Affordability (Tragbarkeit)",
      status: costRatio <= rules.affordabilityLimit ? "pass" : "fail",
      detail:
        `CHF ${fmt(totalYearlyCost)} of CHF ${fmt(grossIncome)} = ` +
        `${pct(costRatio)} (maximum ${pct(rules.affordabilityLimit)}); ` +
        `requires CHF ${fmt(requiredGrossIncome)} gross income`,
      actual: costRatio,
      required: rules.affordabilityLimit,
    },
  ];

  return {
    purchasePrice,
    valuation,
    hardEquity,
    pensionEquity,
    totalEquity,
    equityShare,
    hardEquityShare,
    mortgage,
    loanToValue,
    firstMortgage,
    secondMortgage,
    interest,
    maintenance,
    amortization,
    totalYearlyCost,
    grossIncome,
    costRatio,
    requiredGrossIncome,
    checks,
    passed: checks.every((c) => c.status === "pass"),
  };
}

// ---------------------------------------------------------------------------
// Fixes: what would make a failing application pass
// ---------------------------------------------------------------------------

/**
 * Largest mortgage whose yearly cost still fits the affordability limit.
 *
 * Cost is piecewise linear in the mortgage M, because amortization only starts
 * above the first-mortgage cap c:
 *
 *   cost(M) = r*M + m + max(0, M - c)/A
 *
 * so we solve the branch below c first and fall through to the branch above it.
 * Returns null when even a mortgage of zero cannot fit (maintenance alone
 * exceeds the budget).
 */
function maxAffordableMortgage(
  budget: number,
  maintenance: number,
  firstMortgageCap: number,
  rules: RuleSheet,
): number | null {
  const headroom = budget - maintenance;
  if (headroom <= 0) return null;

  const below = headroom / rules.imputedRate;
  if (below <= firstMortgageCap) return below;

  const slope = rules.imputedRate + 1 / rules.amortizationYears;
  return (headroom + firstMortgageCap / rules.amortizationYears) / slope;
}

/**
 * Highest purchase price that works with the equity the applicant actually has.
 *
 * With valuation tracking price, the second mortgage is P/3 - E, so cost is
 * linear in P on each branch and we invert it directly. The equity rules add
 * their own ceilings (E/20% and hardEquity/10%), and the binding constraint is
 * whichever is lowest.
 */
function maxAffordablePrice(
  grossIncome: number,
  hardEquity: number,
  pensionEquity: number,
  rules: RuleSheet,
): number | null {
  const equity = hardEquity + pensionEquity;
  const budget = grossIncome * rules.affordabilityLimit;

  // Branch where the mortgage stays inside the first-mortgage cap.
  const flatDenominator = rules.imputedRate + rules.maintenanceRate;
  const flatPrice = (budget + rules.imputedRate * equity) / flatDenominator;

  // Branch where a second mortgage exists (P > equity / (1 - firstMortgageShare)).
  const amortSlope = (1 - rules.firstMortgageShare) / rules.amortizationYears;
  const steepDenominator = rules.imputedRate + rules.maintenanceRate + amortSlope;
  const steepPrice =
    (budget + rules.imputedRate * equity + equity / rules.amortizationYears) /
    steepDenominator;

  const crossover = equity / (1 - rules.firstMortgageShare);
  const affordable = flatPrice <= crossover ? flatPrice : steepPrice;

  const equityCeiling = equity / rules.minEquity;
  const hardEquityCeiling = hardEquity / rules.minHardEquity;

  const best = Math.min(affordable, equityCeiling, hardEquityCeiling);
  return best > 0 ? best : null;
}

/**
 * Concrete changes that would turn a failing application into a passing one.
 *
 * Every candidate is re-run through `assess` before being offered, so a fix is
 * only shown when the engine confirms it actually flips every check to pass.
 * That makes these numbers safe to put in front of a credit officer.
 */
export function proposeFixes(
  input: RuleInput,
  rules: RuleSheet = SWISS_RULES,
): Fix[] {
  const current = assess(input, rules);
  if (current.passed) return [];

  const fixes: Fix[] = [];
  const verify = (candidate: RuleInput) => assess(candidate, rules).passed;

  // 1. More hard equity, keeping the same property.
  const budget = input.grossIncome * rules.affordabilityLimit;
  const maintenance = input.purchasePrice * rules.maintenanceRate;
  const cap = current.valuation * rules.firstMortgageShare;
  const maxMortgage = maxAffordableMortgage(budget, maintenance, cap, rules);

  if (maxMortgage !== null) {
    // Enough equity to satisfy affordability and both equity rules at once.
    const neededForAffordability = input.purchasePrice - maxMortgage;
    const neededForEquity = input.purchasePrice * rules.minEquity;
    const neededHard = input.purchasePrice * rules.minHardEquity;

    const targetHard = Math.max(
      input.hardEquity,
      neededHard,
      // Any shortfall has to be covered with hard money, since that is the
      // only kind the applicant can add freely.
      neededForAffordability - input.pensionEquity,
      neededForEquity - input.pensionEquity,
    );
    const extra = targetHard - input.hardEquity;

    if (extra > 0.5) {
      const candidate = { ...input, hardEquity: ceilToHundred(targetHard) };
      fixes.push({
        kind: "more-equity",
        label: `Bring CHF ${fmt(ceilToHundred(extra))} more equity`,
        detail:
          `Raises own funds not from the pension fund to CHF ` +
          `${fmt(ceilToHundred(targetHard))} and cuts the mortgage to CHF ` +
          `${fmt(input.purchasePrice - ceilToHundred(targetHard) - input.pensionEquity)}.`,
        verified: verify(candidate),
      });
    }
  }

  // 2. A cheaper property, with the equity already available.
  const maxPrice = maxAffordablePrice(
    input.grossIncome,
    input.hardEquity,
    input.pensionEquity,
    rules,
  );
  if (maxPrice !== null && maxPrice < input.purchasePrice - 0.5) {
    const target = floorToHundred(maxPrice);
    const candidate = { ...input, purchasePrice: target, bankValuation: undefined };
    fixes.push({
      kind: "lower-price",
      label: `Reduce the purchase price to CHF ${fmt(target)}`,
      detail:
        `CHF ${fmt(input.purchasePrice - target)} below the current price, ` +
        `financed with the same CHF ${fmt(input.hardEquity + input.pensionEquity)} of equity.`,
      verified: verify(candidate),
    });
  }

  // 3. A co-borrower, i.e. more documented income. Only meaningful when
  //    affordability is what failed; it cannot cure an equity shortfall.
  const affordabilityFailed = current.checks.some(
    (c) => c.id === "affordability" && c.status === "fail",
  );
  const equityFailed = current.checks.some(
    (c) => (c.id === "equity" || c.id === "hardEquity") && c.status === "fail",
  );
  if (affordabilityFailed && !equityFailed) {
    const needed = current.requiredGrossIncome - input.grossIncome;
    if (needed > 0.5) {
      const target = ceilToHundred(current.requiredGrossIncome);
      const candidate = { ...input, grossIncome: target };
      fixes.push({
        kind: "more-income",
        label: `Add a co-borrower with CHF ${fmt(ceilToHundred(needed))} gross income`,
        detail:
          `Total documented income would reach CHF ${fmt(target)}, the minimum ` +
          `for yearly costs of CHF ${fmt(current.totalYearlyCost)}.`,
        verified: verify(candidate),
      });
    }
  }

  return fixes;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Swiss thousands separator, no decimals. */
export function fmt(n: number): string {
  return chf(n).toLocaleString("de-CH").replace(/’/g, "'");
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function ceilToHundred(n: number): number {
  return Math.ceil(n / 100) * 100;
}

function floorToHundred(n: number): number {
  return Math.floor(n / 100) * 100;
}
