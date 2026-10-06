/**
 * Is a Claude-powered read available?
 *
 * The page runs the deterministic pipeline in the browser everywhere, so this
 * only answers whether the optional AI read can be offered: it needs both a
 * server to hold the key and a key for it to hold. On the static build the
 * route does not exist at all, the fetch fails, and the page treats that as
 * "not available" — which is the correct answer there.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    claudeAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
