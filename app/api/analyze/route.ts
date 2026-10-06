/**
 * Upload a dossier, get back the full assessment.
 *
 * All the work happens in `lib/`, which has no framework imports, so this
 * handler is only plumbing: multipart in, JSON out.
 */

import { NextResponse } from "next/server";
import { analyzeUpload } from "@/lib/analyze";
import type { UploadedFile } from "@/lib/extract";

/** The Opus read of seven PDFs with thinking on takes a while. */
export const maxDuration = 300;

const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const entries = form.getAll("files").filter((f): f is File => f instanceof File);

    if (entries.length === 0) {
      return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
    }
    if (entries.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files: ${entries.length}. A dossier is 7 documents.` },
        { status: 400 },
      );
    }

    let total = 0;
    const files: UploadedFile[] = [];
    for (const entry of entries) {
      const bytes = new Uint8Array(await entry.arrayBuffer());
      total += bytes.byteLength;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { error: "The dossier exceeds the 32 MB request limit." },
          { status: 413 },
        );
      }
      files.push({ name: entry.name, bytes });
    }

    const forceFallback = form.get("forceFallback") === "true";

    const result = await analyzeUpload(files, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      forceFallback,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    console.error("analyze failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
