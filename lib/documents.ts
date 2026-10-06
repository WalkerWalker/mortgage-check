/**
 * Recognising which of the seven documents a file is, from its name.
 *
 * Kept in its own module with no dependencies so the browser can use it to
 * preview an upload without pulling the Anthropic SDK and the PDF parser into
 * the client bundle.
 */

import type { DocumentKey } from "./types";

const FILENAME_PATTERNS: [RegExp, DocumentKey][] = [
  [/hypothekarantrag|antrag|application/i, "hypothekarantrag"],
  [/lohnausweis|salary/i, "lohnausweis"],
  [/steuererkl|tax/i, "steuererklaerung"],
  [/betreibung|debt.?register/i, "betreibungsregister"],
  [/vorsorge|pension/i, "vorsorgeausweis"],
  // "Vermoegensausweis" spells the umlaut as "oe", so match both forms.
  [/verm(?:oe|ö|o)gens|assets/i, "vermoegensausweis"],
  [/verkaufs|sales|property/i, "verkaufsdokumentation"],
];

export function classifyFilename(name: string): DocumentKey | null {
  for (const [pattern, key] of FILENAME_PATTERNS) {
    if (pattern.test(name)) return key;
  }
  return null;
}
