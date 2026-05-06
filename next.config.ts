import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdf-parse → pdfjs-dist loads optional @napi-rs/canvas in Node. If canvas is
   * missing, pdfjs falls back to browser globals (DOMMatrix, etc.) and crashes
   * on Vercel/serverless. Keep native + pdfjs as externals so runtime resolution
   * matches local Node and tracing can pull .node binaries into the bundle.
   */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/upload": [
      "./node_modules/pdf-parse/dist/worker/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas/**/*.node",
    ],
  },
};

export default nextConfig;
