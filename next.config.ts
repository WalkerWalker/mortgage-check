import type { NextConfig } from "next";

/**
 * Two shapes from one codebase.
 *
 * `npm run dev` runs the full app, including the server routes that call the
 * Anthropic API. `npm run build:static` emits a static site with no server at
 * all, which is what ships to GitHub Pages — there the whole deterministic
 * pipeline runs in the browser and the uploaded PDFs never leave the machine.
 * The static build drops `app/api`, because route handlers cannot exist
 * without a server to run them.
 */
const isStatic = process.env.STATIC_EXPORT === "1";

/** GitHub Pages serves a project site under /<repo>, so assets need a prefix. */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        basePath,
        // Trailing slashes keep deep links working on a static host.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC: isStatic ? "1" : "",
  },
};

export default nextConfig;
