/**
 * The whole check, in the browser.
 *
 * This is what the static build runs. `unpdf` reads the PDFs client-side and
 * the rule engine is pure, so the deterministic pipeline needs no server at
 * all — which means the uploaded documents never leave the machine. For a tool
 * people point at their own salary certificate and pension statement, that is
 * the right default, not a compromise.
 *
 * The Claude path is the one thing that cannot work here, because it needs a
 * key that must not ship to a browser. When a server is available the page
 * prefers it; otherwise it uses this.
 */

import { assessCore } from "./analyze-core";
import { extractWithPatterns, type UploadedFile } from "./fallback";
import type { AnalysisResult } from "./types";

export async function analyzeInBrowser(files: File[]): Promise<AnalysisResult> {
  if (files.length === 0) throw new Error("No documents were uploaded.");

  const uploads: UploadedFile[] = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );

  const extracted = await extractWithPatterns(uploads);
  return assessCore(extracted);
}

/**
 * Fetch one of the bundled sample dossiers and run it.
 *
 * The PDFs are served as static assets and go through the same pipeline as an
 * upload, so a sample is a shortcut for picking files rather than a canned
 * result.
 */
export async function analyzeSampleInBrowser(
  folder: string,
  filenames: readonly string[],
  basePath = "",
): Promise<AnalysisResult> {
  const uploads: UploadedFile[] = await Promise.all(
    filenames.map(async (name) => {
      const url = `${basePath}/samples/${folder}/${name}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not load ${name} (${response.status}).`);
      }
      return { name, bytes: new Uint8Array(await response.arrayBuffer()) };
    }),
  );

  const extracted = await extractWithPatterns(uploads);
  return assessCore(extracted);
}

/** The seven files each bundled dossier contains. */
export const SAMPLE_FILES = [
  "01_Hypothekarantrag.pdf",
  "02_Lohnausweis_2025.pdf",
  "03_Steuererklaerung_2025_Zusammenfassung.pdf",
  "04_Betreibungsregisterauszug.pdf",
  "05_Vorsorgeausweis.pdf",
  "06_Vermoegensausweis_Bank.pdf",
  "07_Verkaufsdokumentation.pdf",
] as const;

export const SAMPLE_FOLDERS: Record<string, string> = {
  A1: "A1_Thomas_Meier",
  A2: "A2_Nicole_Baumgartner",
  A3: "A3_Daniel_Schmid",
};
