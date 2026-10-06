/**
 * Re-run the checks on an extraction a human has corrected.
 *
 * Separate from /api/analyze so that fixing a misread figure costs nothing and
 * does not re-read the PDFs. This is also what makes the extracted-numbers
 * table worth making editable: an advisor who spots a wrong figure can correct
 * it and see the decision move.
 */

import { NextResponse } from "next/server";
import { assessDossier } from "@/lib/analyze";
import type { ExtractedDossier } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      extracted?: ExtractedDossier;
      redraft?: boolean;
    };

    if (!body.extracted) {
      return NextResponse.json({ error: "No extraction supplied." }, { status: 400 });
    }

    const result = await assessDossier(body.extracted, {
      // Redrafting the Kreditantrag is the only part that costs an API call, so
      // it is opt-in: editing a figure re-runs the arithmetic for free.
      apiKey: body.redraft ? process.env.ANTHROPIC_API_KEY : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Re-assessment failed.";
    console.error("reassess failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
