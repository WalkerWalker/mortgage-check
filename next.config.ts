import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  experimental: {
    serverActions: {
      // Seven PDFs in one request. The defaults are well under this.
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
