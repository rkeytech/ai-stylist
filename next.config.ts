import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the project folder as the root even if other lockfiles exist higher up.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
