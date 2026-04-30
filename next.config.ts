import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/upload": ["./node_modules/pdf-parse/dist/worker/pdf.worker.mjs"]
  }
};

export default nextConfig;
