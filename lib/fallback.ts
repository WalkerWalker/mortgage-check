/**
 * Reading the dossier without the model.
 *
 * This exists so the app still works with no API key configured, and so there
 * is a second independent read to compare the model's against. It is not the
 * point of the exercise — a regex cannot read a scan, and it only works because
 * these particular documents are machine-generated and regular.
 *
 * The patterns below are written against the actual text `unpdf` returns, which
 * puts each label and its value on one line ("Kaufpreis CHF 1'250'000.00") with
 * a few fields wrapping onto the next ("Bruttojahreseinkommen gemäss Angabe\n
 * Antragsteller\nCHF 190'000.00"). `scripts/dumptext.mjs` prints that text.
 */

import { extractText, getDocumentProxy } from "unpdf";
import { classifyFilename } from "./documents";
import { assertPlausible, shape, type FlatExtraction, type FlatSourced } from "./shape";
import type { DebtRegisterEntry, DocumentKey, ExtractedDossier } from "./types";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** An amount: 165'000.00, 165’000.00, 165 000.00, 165,000.00 or 141'267. */
function amount(raw: string): number {
  const n = Number.parseFloat(raw.replace(/['’,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A money-shaped number.
 *
 * Thousands may be grouped by apostrophe, comma or space — Swiss documents use
 * the apostrophe, but accepting the others matters because a pattern that
 * matches only the first group returns 900 for "900 000.00", which is a
 * thousandfold error that no later check would catch. Groups must be exactly
 * three digits, so a date like "14. März" cannot pass as an amount.
 */
const NUMBER = String.raw`(\d{1,3}(?:['’,  ]\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)`;

/** The same, minus the bare-integer case, for use without a currency anchor. */
const MONEY_SHAPED = String.raw`(\d{1,3}(?:['’,  ]\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2})`;

/**
 * The first amount after a label.
 *
 * Anchored on the "CHF" that precedes every amount in these documents rather
 * than on the next run of digits, because labels carry dates of their own:
 * "Altersguthaben per 01.01.2026 CHF 310'500.00" would otherwise yield 1.01.
 * The lazy quantifier stops at the field's own CHF, not a later one, and the
 * window is wide enough to clear a sentence of prose between the two.
 *
 * Without a currency marker the only safe fallback is a money-shaped number
 * within a short reach, because the looser alternative — the next digits at any
 * distance — reads the day out of a date and reports it as francs. A miss here
 * returns null and `assertPlausible` turns that into a refusal, which is the
 * outcome to want: no answer beats a confident wrong one.
 */
export function after(text: string, label: RegExp): number | null {
  // Compiled multiline so a label written as /^Total/ anchors to the start of
  // its line rather than the start of the whole document.
  const withCurrency = new RegExp(
    label.source + String.raw`[\s\S]{0,200}?CHF\s*` + NUMBER,
    "im",
  ).exec(text);
  if (withCurrency) return amount(withCurrency[1]);

  const plain = new RegExp(
    label.source + String.raw`[^\d]{0,40}?` + MONEY_SHAPED,
    "im",
  ).exec(text);
  return plain ? amount(plain[1]) : null;
}

/** The rest of the line a label sits on. */
function restOfLine(text: string, label: RegExp): string {
  const m = new RegExp(String.raw`^\s*` + label.source + String.raw`[ \t]+(.+)$`, "im").exec(
    text,
  );
  return m ? m[1].trim() : "";
}

/**
 * Drop the fixtures' header banner.
 *
 * It contains the word "names", which a `/Name/` pattern would otherwise match
 * before reaching the applicant's actual name field.
 */
function clean(text: string): string {
  return text
    .replace(/^.*FICTIONAL TEST DATA.*$/gim, "")
    .replace(/^\s*Seite \d+\s*$/gim, "")
    .trim();
}

function parseDebtRegister(text: string): DebtRegisterEntry[] {
  const tail = text.split(/Erfasster Zeitraum[^\n]*/i).pop() ?? text;

  // The clean extracts state it in words. Anything else means there are rows.
  if (/keine\s+Betreibungen|keine\s+Eintr[aä]ge/i.test(tail)) return [];

  // An entry row is a date, a creditor, and an amount on one line. A trailing
  // line such as "02.05.2024 bezahlt" has no amount, so it cannot start a new
  // entry and is folded into the previous entry's status instead.
  const row = new RegExp(
    String.raw`(\d{2}\.\d{2}\.\d{4})[ \t]+([^\d\n][^\n]*?)[ \t]+` +
      String.raw`(\d[\d'’]*\.\d{2})[ \t]*([^\n]*)`,
    "g",
  );

  const entries: DebtRegisterEntry[] = [];
  const spans: { end: number; index: number }[] = [];

  for (const m of tail.matchAll(row)) {
    entries.push({
      date: m[1],
      creditor: m[2].trim(),
      amount: amount(m[3]),
      status: m[4].trim(),
    });
    spans.push({ end: (m.index ?? 0) + m[0].length, index: entries.length - 1 });
  }

  // Append continuation lines to the status of the entry they follow.
  for (let i = 0; i < spans.length; i++) {
    const from = spans[i].end;
    const to = i + 1 < spans.length ? (tail.indexOf("\n", spans[i].end) ?? -1) : tail.length;
    const slice = tail.slice(from, i + 1 < spans.length ? Math.max(from, to) : to);
    const continuation = slice.replace(/\s+/g, " ").trim();
    if (continuation) {
      const e = entries[spans[i].index];
      e.status = `${e.status} ${continuation}`.replace(/\s+/g, " ").trim();
    }
  }

  return entries;
}

export async function extractWithPatterns(
  files: UploadedFile[],
): Promise<ExtractedDossier> {
  const docs = new Map<DocumentKey, { name: string; text: string }>();

  for (const f of files) {
    const key = classifyFilename(f.name);
    if (!key) continue;
    const pdf = await getDocumentProxy(new Uint8Array(f.bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    docs.set(key, {
      name: f.name,
      text: clean(Array.isArray(text) ? text.join("\n") : text),
    });
  }

  if (!docs.has("hypothekarantrag")) {
    throw new Error(
      "Could not find the application form (01_Hypothekarantrag) in the upload.",
    );
  }

  const textOf = (k: DocumentKey) => docs.get(k)?.text ?? "";
  const nameOf = (k: DocumentKey) => docs.get(k)?.name ?? "(missing)";

  /** Read an amount from a document, recording where it came from. */
  const read = (k: DocumentKey, label: RegExp, printed: string): FlatSourced => ({
    value: after(textOf(k), label) ?? 0,
    document: nameOf(k),
    label: printed,
  });

  const vermoegen = textOf("vermoegensausweis");
  const accounts =
    (after(vermoegen, /Privatkonto/) ?? 0) + (after(vermoegen, /Sparkonto/) ?? 0);
  const securitiesOnStatement = after(vermoegen, /Wertschriftendepot/) ?? 0;
  const statementTotal = after(vermoegen, /^Total/m);

  const flat: FlatExtraction = {
    applicantName:
      restOfLine(textOf("hypothekarantrag"), /Name/) ||
      restOfLine(textOf("lohnausweis"), /Arbeitnehmer/),
    dateOfBirth: restOfLine(textOf("hypothekarantrag"), /Geburtsdatum/),
    address: restOfLine(textOf("hypothekarantrag"), /Adresse/),
    maritalStatus: restOfLine(textOf("hypothekarantrag"), /Zivilstand/),
    employer: restOfLine(textOf("hypothekarantrag"), /Arbeitgeber/),

    propertyDescription:
      restOfLine(textOf("verkaufsdokumentation"), /Verkaufsdokumentation:/) ||
      restOfLine(textOf("hypothekarantrag"), /Objekt/),
    propertyAddress: restOfLine(textOf("verkaufsdokumentation"), /Adresse/),

    priceOnApplication: read("hypothekarantrag", /Kaufpreis/, "Kaufpreis"),
    priceOnSalesDoc: read("verkaufsdokumentation", /Verkaufspreis/, "Verkaufspreis"),

    statedIncome: read(
      "hypothekarantrag",
      /Bruttojahreseinkommen gem[äa]ss Angabe/,
      "Bruttojahreseinkommen gemäss Angabe",
    ),
    grossOnLohnausweis: read(
      "lohnausweis",
      /8\.\s*Bruttolohn total/,
      "8. Bruttolohn total",
    ),
    netOnLohnausweis: read("lohnausweis", /11\.\s*Nettolohn/, "11. Nettolohn"),
    netOnTaxReturn: read(
      "steuererklaerung",
      /Nettolohn Haupterwerb/,
      "Nettolohn Haupterwerb",
    ),
    insuredSalary: read("vorsorgeausweis", /Versicherter Lohn/, "Versicherter Lohn"),

    bankAccountsOnApplication: read(
      "hypothekarantrag",
      /Bank-\s*und Sparkonten/,
      "Bank- und Sparkonten",
    ),
    // "Wertschriften" also opens "Wertschriftenertrag" on the tax return, whose
    // value is dividend income rather than the holding, so exclude it.
    securitiesOnApplication: read(
      "hypothekarantrag",
      /Wertschriften(?!ertrag)/,
      "Wertschriften",
    ),
    pensionWithdrawalOnApplication: read(
      "hypothekarantrag",
      /Vorbezug Pensionskasse/,
      "Vorbezug Pensionskasse (WEF)",
    ),
    equityTotalOnApplication: read(
      "hypothekarantrag",
      /Total Eigenmittel/,
      "Total Eigenmittel",
    ),

    accountsOnBankStatement: {
      value: accounts,
      document: nameOf("vermoegensausweis"),
      label: "Privatkonto + Sparkonto",
    },
    securitiesOnBankStatement: {
      value: securitiesOnStatement,
      document: nameOf("vermoegensausweis"),
      label: "Wertschriftendepot (Kurswert)",
    },
    totalOnBankStatement: {
      // Prefer the statement's own total; fall back to summing its positions.
      value: statementTotal ?? accounts + securitiesOnStatement,
      document: nameOf("vermoegensausweis"),
      label: statementTotal === null ? "Total (summed from positions)" : "Total",
    },

    bankAssetsOnTaxReturn: read("steuererklaerung", /Bankguthaben/, "Bankguthaben"),
    securitiesOnTaxReturn: read(
      "steuererklaerung",
      /Wertschriften(?!ertrag)/,
      "Wertschriften",
    ),
    debtsOnTaxReturn: read("steuererklaerung", /Schulden/, "Schulden"),

    pensionAssets: read("vorsorgeausweis", /Altersguthaben/, "Altersguthaben"),
    maxWefAvailable: read(
      "vorsorgeausweis",
      /Maximal m[öo]glicher Vorbezug/,
      "Maximal möglicher Vorbezug für Wohneigentum (WEF)",
    ),
    wefRequested: read(
      "vorsorgeausweis",
      /Beantragter WEF-Vorbezug/,
      "Beantragter WEF-Vorbezug",
    ),
    wefAlreadyWithdrawn: read(
      "vorsorgeausweis",
      /Bereits bezogene WEF-Vorbez/,
      "Bereits bezogene WEF-Vorbezüge",
    ),

    mortgageRequested: read(
      "hypothekarantrag",
      /Beantragte Hypothek/,
      "Beantragte Hypothek",
    ),
    obligationsPerYear: read(
      "hypothekarantrag",
      /Leasing-\s*und Kreditverpflichtungen/,
      "Leasing- und Kreditverpflichtungen",
    ),

    debtRegisterEntries: [],
    debtRegisterHasEntries: false,
    debtRegisterDocument: nameOf("betreibungsregister"),

    documentTypesPresent: [...docs.keys()],
  };

  const entries = parseDebtRegister(textOf("betreibungsregister"));
  flat.debtRegisterEntries = entries;
  flat.debtRegisterHasEntries = entries.length > 0;

  const dossier = shape(flat, [...docs.keys()], "pattern-fallback");
  assertPlausible(dossier);
  return dossier;
}
