/**
 * Run the pipeline over one of the three bundled sample dossiers.
 *
 * This reads the real PDFs off disk and puts them through the same
 * `analyzeUpload` as an upload does, so the demo buttons are a shortcut for
 * picking files, not a bypass of the extraction step. The hardcoded fixtures in
 * `lib/samples.ts` are for the tests; this route does not use them.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { analyzeUpload } from "@/lib/analyze";
import type { UploadedFile } from "@/lib/extract";

export const maxDuration = 300;

const FOLDERS: Record<string, string> = {
  A1: "A1_Thomas_Meier",
  A2: "A2_Nicole_Baumgartner",
  A3: "A3_Daniel_Schmid",
};

export async function POST(request: Request) {
  try {
    const { id, forceFallback } = (await request.json()) as {
      id?: string;
      forceFallback?: boolean;
    };

    const folder = id ? FOLDERS[id] : undefined;
    if (!folder) {
      return NextResponse.json(
        { error: `Unknown sample dossier: ${id}. Expected A1, A2 or A3.` },
        { status: 400 },
      );
    }

    const dir = path.join(process.cwd(), "samples", folder);
    const names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith(".pdf")).sort();

    if (names.length === 0) {
      return NextResponse.json(
        { error: `No PDFs found in samples/${folder}.` },
        { status: 404 },
      );
    }

    const files: UploadedFile[] = await Promise.all(
      names.map(async (name) => ({
        name,
        bytes: new Uint8Array(await readFile(path.join(dir, name))),
      })),
    );

    const result = await analyzeUpload(files, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      forceFallback: Boolean(forceFallback),
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sample analysis failed.";
    console.error("sample failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
