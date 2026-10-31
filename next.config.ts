import type { NextConfig } from "next";

// Temporary: STATIC_EXPORT=1 builds a static site for GitHub Pages
// (.github/workflows/pages.yml). Normal builds are unaffected.
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? { output: "export", basePath: process.env.PAGES_BASE_PATH || undefined }
  : {};

export default nextConfig;
