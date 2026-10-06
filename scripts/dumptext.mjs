/**
 * Print the raw text unpdf extracts from a PDF, for writing the fallback
 * parser's patterns against reality rather than against a guess.
 *
 *   node scripts/dumptext.mjs samples/A1_Thomas_Meier/01_Hypothekarantrag.pdf
 */

import { extractText, getDocumentProxy } from "unpdf";
import { readFile } from "node:fs/promises";
import path from "node:path";

for (const file of process.argv.slice(2)) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text;
  console.log(`\n##### ${path.basename(file)}`);
  console.log(JSON.stringify(merged));
}
