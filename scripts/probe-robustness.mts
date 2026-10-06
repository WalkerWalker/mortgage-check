/**
 * What does the pattern parser actually depend on?
 *
 * Feeds realistic variations of one line through the same `after()` the parser
 * uses, to show which changes it survives and which it does not. Run with:
 *
 *   npx tsx scripts/probe-robustness.mts
 */

import { after } from "../lib/fallback";

const WANT = 900_000;

const cases: { what: string; text: string; label: RegExp }[] = [
  { what: "the real line, as unpdf returns it", text: "Kaufpreis CHF 900'000.00", label: /Kaufpreis/ },

  // Layout and formatting
  { what: "value on the next line", text: "Kaufpreis\nCHF 900'000.00", label: /Kaufpreis/ },
  { what: "value two lines down, with a note between", text: "Kaufpreis\n(gemäss Vertrag)\nCHF 900'000.00", label: /Kaufpreis/ },
  { what: "lots of whitespace, as from a wide table", text: "Kaufpreis      CHF    900'000.00", label: /Kaufpreis/ },
  { what: "no currency printed", text: "Kaufpreis 900'000.00", label: /Kaufpreis/ },
  { what: "curly apostrophe instead of straight", text: "Kaufpreis CHF 900’000.00", label: /Kaufpreis/ },
  { what: "no decimals", text: "Kaufpreis CHF 900'000", label: /Kaufpreis/ },
  { what: "label in a different case", text: "KAUFPREIS CHF 900'000.00", label: /Kaufpreis/ },

  // Wording
  { what: "extra words after the label", text: "Kaufpreis (inkl. Nebenkosten) CHF 900'000.00", label: /Kaufpreis/ },
  { what: "a different word for the same thing", text: "Erwerbspreis CHF 900'000.00", label: /Kaufpreis/ },
  { what: "the label in French", text: "Prix d'achat CHF 900'000.00", label: /Kaufpreis/ },

  // Order and separators
  { what: "value printed before the label", text: "CHF 900'000.00 Kaufpreis", label: /Kaufpreis/ },
  { what: "space as the thousands separator", text: "Kaufpreis CHF 900 000.00", label: /Kaufpreis/ },
  { what: "comma as the thousands separator", text: "Kaufpreis CHF 900,000.00", label: /Kaufpreis/ },
  { what: "a long sentence between label and value", text: "Kaufpreis gemäss dem am 14. März unterzeichneten Kaufvertrag zwischen den Parteien, zahlbar bei Handänderung CHF 900'000.00", label: /Kaufpreis/ },

  // No text layer at all
  { what: "a scan (no extractable text)", text: "", label: /Kaufpreis/ },
];

const rows = cases.map((c) => {
  const got = after(c.text, c.label);
  const ok = got === WANT;
  return {
    verdict: ok ? "works" : got === null ? "FAILS (no match)" : `WRONG (${got})`,
    what: c.what,
  };
});

const width = Math.max(...rows.map((r) => r.verdict.length));
for (const r of rows) {
  console.log(`${r.verdict.padEnd(width)}  ${r.what}`);
}

const broken = rows.filter((r) => r.verdict !== "works").length;
console.log(`\n${rows.length - broken}/${rows.length} survive; ${broken} do not.`);
